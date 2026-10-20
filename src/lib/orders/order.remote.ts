import { error, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { id } from "#lib/schema.ts";
import { idInTenant, idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
	orderRequest,
	user,
} from "#lib/server/db/schema.ts";
import { refuseOffParts } from "#lib/server/forms.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { orderFields } from "./form/order-schema.ts";
import { createOrders } from "./server/creation.ts";
import { orderCommitted, tagOrders } from "./server/hooks.ts";
import { beginOrderChange } from "./server/lifecycle.ts";
import { orderByNumber } from "./server/lookup.ts";
import { removeOrder } from "./server/order-changes.ts";
import { STANDARD_HOURLY_RATE, priceOrders } from "./server/pricing.ts";
import { tenantOrderTypes } from "./server/types.ts";
import { onAnyUnit, setOrderUnits, unitIdsOf } from "./server/units.ts";
import { officeOrders, readWorkRecords } from "./server/work-record.ts";
import { offeredOrderTypes } from "./types.ts";

/**
 * Orders by number, each with everything on it: its work record (its units in their order, the
 * sites the work is at, the notes and the sign-off, see `readWorkRecord()`), its price, its modules'
 * tags and whether a customer reported it. What its page shows, and its hover card (`OrderLink`): a
 * batch query, so the cards of a page's links come in one request (priced and tagged together), and
 * a hover card and the page share their answer. An unknown number (or another tenant's) is a 404 for
 * that number. Other orders for the same units are `getOrderHistory`.
 */
export const getOrder = forMembers.query.batch(v.string(), async (numbers) => {
	const [found, records] = await Promise.all([
		db.query.order.findMany({
			where: and(inList(order.number, numbers), inTenant(order)),
			with: { customer: true, engineer: true },
		}),
		readWorkRecords(officeOrders(numbers)),
	]);
	const facts = found.map((one) => ({
		...one,
		equipmentIds: records.get(one.number)?.units.map((unit) => unit.id) ?? [],
		hourlyRate: one.engineer?.hourlyRate,
	}));
	const decider = alias(user, "decider");
	const [prices, tags, requests] = await Promise.all([
		priceOrders(facts, { items: true }),
		tagOrders(facts),
		// Reported in the customer portal: by whom, and what a planner decided.
		found.length
			? db
					.select({
						orderId: orderRequest.orderId,
						reporterName: orderRequest.reporterName,
						decidedAt: orderRequest.decidedAt,
						decidedBy: decider.name,
						rejectionReason: orderRequest.rejectionReason,
					})
					.from(orderRequest)
					.leftJoin(decider, eq(orderRequest.decidedBy, decider.id))
					.where(
						and(
							inList(
								orderRequest.orderId,
								found.map((one) => one.id),
							),
							inTenant(orderRequest),
						),
					)
			: [],
	]);
	const at = new Map(found.map((one, i) => [one.number, i]));
	const requestOf = new Map(requests.map(({ orderId, ...request }) => [orderId, request]));

	return (number: string) => {
		const i = at.get(number);
		const record = records.get(number);
		if (i === undefined || !record) error(404, m.orders_not_found({ number }));
		const one = found[i];
		const { units, sites, notes, signoff } = record;
		return {
			order: { ...one, units },
			sites,
			/** What was recorded on it in the field. */
			notes,
			signoff,
			totals: { ...prices[i], laborRate: one.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE },
			/** From the tenant's modules, e.g. a response time about to be missed. */
			tags: tags[i],
			/** If a customer reported it in the portal: who, and the planner's decision. */
			request: requestOf.get(one.id) ?? null,
		};
	};
});

/** Earlier and later work on an order's units, for context on its page: the latest eight. */
export const getOrderHistory = forMembers.query(v.string(), async (number) => {
	const found = await orderByNumber(number, (where) =>
		db.query.order.findMany({
			where,
			columns: { id: true },
			with: { units: { columns: { equipmentId: true } } },
		}),
	);
	const equipmentIds = found.units.map((unit) => unit.equipmentId);
	if (!equipmentIds.length) return [];
	return db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(and(onAnyUnit(equipmentIds), ne(order.id, found.id), inTenant(order)))
		.orderBy(desc(order.createdAt))
		.limit(8);
});

/** Everything the order form needs to choose from. */
export const getOrderFormOptions = forMembers.query(async () => {
	const [customers, equipments, engineers] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
			.where(inTenant(customer))
			.orderBy(asc(customer.name)),
		db
			.select({
				id: equipment.id,
				customerId: equipment.customerId,
				name: equipment.name,
				model: equipment.model,
				manufacturer: equipment.manufacturer,
				serialNumber: equipment.serialNumber,
				/** The name of its location at the site, if it has one. */
				location: equipmentLocation.name,
				/** The customer's site it's at, to pick the units of a site together. */
				site: { id: customerSite.id, name: customerSite.name },
				/** The specialty of the engineers who service its category, if any. */
				specialty: equipmentCategory.specialty,
			})
			.from(equipment)
			.innerJoin(...tenantJoin(customerSite, equipment.siteId))
			.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
			.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
			.where(inTenant(equipment))
			// By site, then as the customer names them (`Deur 01`, `Deur 02`, …), then by make.
			.orderBy(
				asc(customerSite.name),
				asc(sql`coalesce(${equipment.name}, ${equipment.manufacturer}) collate nocase`),
				asc(equipment.model),
				asc(equipment.serialNumber),
			),
		db
			.select({
				id: engineer.id,
				name: engineer.name,
				specialty: engineer.specialty,
				active: engineer.active,
			})
			.from(engineer)
			.where(inTenant(engineer))
			.orderBy(asc(engineer.name)),
	]);
	return { customers, equipments, engineers };
});

const orderSchema = v.object(orderFields);

type OrderInput = v.InferOutput<typeof orderSchema>;

/**
 * Creates or updates an order in the current tenant, with the parts the tenant's modules add to the
 * form (`modules`, saved through `orders.saving`, see `beginOrderChange()`); returns its number.
 * Throws a `Refused` when a module can't save its part or let go of a unit, on the form's fields.
 */
async function saveOrder(id: number | null, input: OrderInput) {
	const { modules, scheduledTime, equipmentIds: units, ...fields } = input;
	const equipmentIds = [...new Set(units)];

	return db.transaction(async (tx) => {
		// Refused for an order that can't be changed (invoiced, awaiting acceptance), or a 404.
		const change = await beginOrderChange(tx, id, fields.status);
		const existing = change.before;
		// A type the tenant hid is no choice, unless the order has it already.
		if (!offeredOrderTypes(tenantOrderTypes(), existing?.type).includes(fields.type)) {
			throw new Refused({ path: ["type"], message: m.orders_type_hidden_refused() });
		}
		const unitsBefore = existing
			? ((await unitIdsOf([existing.id], tx)).get(existing.id) ?? [])
			: [];

		const values = {
			...fields,
			scheduledFor: fields.scheduledFor
				? fields.scheduledFor
						.toZonedDateTime({ timeZone: getTimeZone(), plainTime: scheduledTime ?? "00:00" })
						.toInstant()
				: null,
			// The status, with the completion date that follows from it.
			...change.columns,
		};

		let orderId: number;
		let number: string;
		if (existing) {
			orderId = existing.id;
			number = existing.number;
			// Its units are its customer's: they go before the customer can change. Otherwise the
			// units it keeps stay (with what the modules keep about them).
			if (existing.customerId !== values.customerId) await setOrderUnits(tx, existing, []);
			await tx.update(order).set(values).where(idInTenant(order, orderId));
			await setOrderUnits(tx, { id: orderId, customerId: values.customerId }, equipmentIds);
		} else {
			// Checked, numbered and logged as created there.
			[{ id: orderId, number }] = await createOrders(tx, [{ ...values, units: equipmentIds }]);
		}

		// The modules' parts of it, e.g. its materials, and the stock that follows its status; then
		// its entry, the units by id, in their order (the log names those added and removed).
		await change.finish(
			{ id: orderId, number },
			{
				form: modules ?? {},
				before: { equipmentIds: unitsBefore },
				after: { ...values, equipmentIds },
			},
		);
		return number;
	});
}

/** Checks that the order's references exist in the current tenant and belong together. */
async function checkReferences(input: OrderInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	const [found, units, assignee] = await Promise.all([
		db.query.customer.findFirst({
			columns: { id: true },
			where: idInTenant(customer, input.customerId),
		}),
		input.equipmentIds.length
			? db
					.select({ id: equipment.id, customerId: equipment.customerId })
					.from(equipment)
					.where(idsInTenant(equipment, input.equipmentIds))
			: [],
		input.engineerId
			? db.query.engineer.findFirst({
					columns: { id: true },
					where: idInTenant(engineer, input.engineerId),
				})
			: undefined,
	]);
	if (!found) problems.push({ path: ["customerId"], message: m.orders_unknown_customer() });
	// Another tenant's unit isn't found: it's no unit of this customer's either.
	const ownerOf = new Map(units.map((unit) => [unit.id, unit.customerId]));
	if (input.equipmentIds.some((unit) => ownerOf.get(unit) !== input.customerId)) {
		problems.push({ path: ["equipmentIds"], message: m.orders_units_other_customer() });
	}
	if (input.engineerId && !assignee) {
		problems.push({ path: ["engineerId"], message: m.orders_unknown_engineer() });
	}
	return problems;
}

/**
 * Refuses the form if it has a part of a module the tenant doesn't have, or the order's references
 * are wrong, each problem on its field.
 */
async function refuseProblems(input: OrderInput) {
	refuseOffParts(input.modules ?? {});
	Refused.check(await checkReferences(input));
}

export const createOrder = forMembers.form(orderSchema, async (input) => {
	await refuseProblems(input);
	const number = await saveOrder(null, input);
	redirect(303, `/orders/${number}`);
});

export const updateOrder = forMembers.form(v.object({ id: id(), ...orderFields }), async (data) => {
	const { id, ...input } = data;
	await refuseProblems(input);
	const number = await saveOrder(id, input);
	void getOrder(number).refresh();
	// Its units may have changed.
	void getOrderHistory(number).refresh();
	orderCommitted({ number });
	redirect(303, `/orders/${number}`);
});

export const deleteOrder = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeOrder(id);
	redirect(303, "/orders");
});
