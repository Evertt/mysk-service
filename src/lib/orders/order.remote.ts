import type { RemoteFormInvalidField } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { isEditableOrder } from "#lib/models.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant, idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";
import { refuseOffParts } from "#lib/server/forms.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { orderFields } from "./form/order-schema.ts";
import { createOrders } from "./server/creation.ts";
import { orderCommitted, OrderRefused, saveOrderParts, tagOrders } from "./server/hooks.ts";
import { completedAt, notEditable, removeOrder } from "./server/order-changes.ts";
import { STANDARD_HOURLY_RATE, priceOrders } from "./server/pricing.ts";
import { onAnyUnit, setOrderUnits, unitIdsOf } from "./server/units.ts";

/**
 * One order with everything on it: its units in their order, other orders for the same units, and
 * the sites the work is at: its units' (one, usually), or the customer's only one for an order
 * without units.
 */
export const getOrder = forMembers.query(v.string(), async (number) => {
	const found = await db.query.order.findFirst({
		where: and(eq(order.number, number), inTenant(order)),
		with: {
			customer: { with: { sites: true } },
			units: {
				orderBy: asc(orderUnit.position),
				with: {
					equipment: {
						with: {
							site: true,
							location: { columns: { name: true } },
							category: { columns: { name: true } },
						},
					},
				},
			},
			engineer: true,
		},
	});
	if (!found) error(404, m.orders_not_found({ number }));
	const { sites: customerSites, ...owner } = found.customer;
	// Each unit with the name of its location at the site, if it has one.
	const units = found.units.map(({ equipment: unit }) => ({
		...unit,
		location: unit.location?.name ?? null,
	}));
	const sites = units.length
		? [...new Map(units.map((unit) => [unit.site.id, unit.site])).values()]
		: customerSites.length === 1
			? customerSites
			: [];
	const equipmentIds = units.map((unit) => unit.id);

	// Earlier and later work on the same units, for context.
	const history = equipmentIds.length
		? await db
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
				.limit(8)
		: [];

	const facts = { ...found, equipmentIds, hourlyRate: found.engineer?.hourlyRate };
	const [[price], [tags]] = await Promise.all([
		priceOrders([facts], { items: true }),
		tagOrders([facts]),
	]);

	return {
		order: { ...found, customer: owner, units },
		sites,
		totals: { ...price, laborRate: found.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE },
		/** From the tenant's modules, e.g. a response time about to be missed. */
		tags,
		history,
	};
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

type OrderIssue = RemoteFormInvalidField<v.InferInput<typeof orderSchema>>;

/**
 * Creates or updates an order in the current tenant, with the parts the tenant's modules add to the
 * form (`modules`, saved through `orders.saving`); returns its number. Throws an `OrderRefused`
 * when a module can't save its part (see `refuseParts`).
 */
async function saveOrder(id: number | null, input: OrderInput) {
	const { modules, scheduledTime, equipmentIds: units, ...fields } = input;
	const equipmentIds = [...new Set(units)];

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.order.findFirst({
					where: idInTenant(order, id),
				})
			: undefined;
		if (id && !existing) error(404, m.orders_not_found_plain());
		if (existing && !isEditableOrder(existing.status)) {
			invalid(notEditable(existing.number, "changed"));
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
			// Keep the original completion date; set or clear it when the status changes.
			completedAt: completedAt(fields.status, existing),
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

		// The modules' parts of it, e.g. its materials, and the stock that follows its status.
		await saveOrderParts({
			tx,
			order: { id: orderId, number },
			status: fields.status,
			form: modules ?? {},
		});
		// The modules log their parts; a new order is logged by `createOrders()`; the completion
		// date follows from the status.
		if (existing) {
			const subject = { type: "order", id: orderId, label: number };
			const ignore = ["completedAt"];
			await recordActivity(tx, {
				action: "updated",
				subject,
				// The units by id, in their order: the log names those added and removed.
				before: { ...existing, equipmentIds: unitsBefore },
				after: { ...values, equipmentIds },
				ignore,
			});
		}
		return number;
	});
}

/**
 * Refuses the form with the problems of a module that couldn't save its part, each on the field of
 * the form it names (a module's part's fields are under `modules.<its id>`), or for the whole form:
 * they're validation issues as they are.
 */
function refuseParts(refused: OrderRefused): never {
	invalid(...refused.problems);
}

interface ReferenceProblem {
	field: "customerId" | "equipmentIds" | "engineerId";
	message: string;
}

/** Checks that the order's references exist in the current tenant and belong together. */
async function checkReferences(input: OrderInput): Promise<ReferenceProblem[]> {
	const problems: ReferenceProblem[] = [];
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
	if (!found) problems.push({ field: "customerId", message: m.orders_unknown_customer() });
	// Another tenant's unit isn't found: it's no unit of this customer's either.
	const ownerOf = new Map(units.map((unit) => [unit.id, unit.customerId]));
	if (input.equipmentIds.some((unit) => ownerOf.get(unit) !== input.customerId)) {
		problems.push({ field: "equipmentIds", message: m.orders_units_other_customer() });
	}
	if (input.engineerId && !assignee) {
		problems.push({ field: "engineerId", message: m.orders_unknown_engineer() });
	}
	return problems;
}

/**
 * Refuses the form if it has a part of a module the tenant doesn't have, or the order's references
 * are wrong, each problem on its field.
 */
async function refuseProblems(issue: OrderIssue, input: OrderInput) {
	refuseOffParts(input.modules ?? {});
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map(({ field, message }) => issue[field](message)));
}

export const createOrder = forMembers.form(orderSchema, async (input, issue) => {
	await refuseProblems(issue, input);
	const number = await saveOrder(null, input).catch((error) => {
		if (error instanceof OrderRefused) refuseParts(error);
		throw error;
	});
	redirect(303, `/orders/${number}`);
});

export const updateOrder = forMembers.form(
	v.object({ id: id(), ...orderFields }),
	async (data, issue) => {
		const { id, ...input } = data;
		await refuseProblems(issue, input);
		const number = await saveOrder(id, input).catch((error) => {
			if (error instanceof OrderRefused) refuseParts(error);
			throw error;
		});
		void getOrder(number).refresh();
		orderCommitted({ number });
		redirect(303, `/orders/${number}`);
	},
);

export const deleteOrder = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeOrder(id);
	redirect(303, "/orders");
});
