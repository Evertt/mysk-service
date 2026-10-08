import { form, query, type RemoteFormInvalidField } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import * as v from "valibot";

import { atTime } from "#lib/dates.ts";
import { OrderStockShortage } from "#lib/materials/server/stock.ts";
import { isEditableOrder, lineTotal } from "#lib/models.ts";
import {
	checkLines,
	type LineInput,
	type LineProblem,
	saveOrderLines,
} from "#lib/orders/server/lines.ts";
import { completedAt, notEditable, removeOrder } from "#lib/orders/server/order-changes.ts";
import { priceOrders, STANDARD_HOURLY_RATE } from "#lib/orders/server/pricing.ts";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, material, order } from "#lib/server/db/schema.ts";
import { orderCommitted, tagOrders } from "#lib/server/modules.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { idInTenant, inTenant, requireMember } from "#lib/server/session.ts";

import { orderFields } from "./order-schema.ts";

/** One order with everything on it, plus other orders for the same equipment. */
export const getOrder = query(v.string(), async (number) => {
	requireMember();
	const found = await db.query.order.findFirst({
		where: and(eq(order.number, number), inTenant(order)),
		with: {
			customer: true,
			equipment: true,
			engineer: true,
			lines: { with: { material: true }, orderBy: (line, { asc }) => asc(line.id) },
		},
	});
	if (!found) error(404, m.orders_not_found({ number }));

	// Earlier and later work on the same unit, for context.
	const history = found.equipmentId
		? await db.query.order.findMany({
				columns: { id: true, number: true, type: true, status: true, createdAt: true },
				where: and(
					eq(order.equipmentId, found.equipmentId),
					ne(order.id, found.id),
					inTenant(order),
				),
				orderBy: desc(order.createdAt),
				limit: 8,
			})
		: [];

	const lines = found.lines.map((line) => ({
		...line,
		total: lineTotal(line.quantity, line.unitPrice),
	}));
	const facts = {
		...found,
		materials: lines.reduce((sum, line) => sum + line.total, 0),
		hourlyRate: found.engineer?.hourlyRate,
	};
	const [[price], [tags]] = await Promise.all([priceOrders([facts]), tagOrders([facts])]);

	return {
		order: { ...found, lines },
		totals: { ...price, laborRate: found.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE },
		/** From the tenant's modules, e.g. a response time about to be missed. */
		tags,
		history,
	};
});

/** Everything the order form needs to choose from. */
export const getOrderFormOptions = query(async () => {
	requireMember();
	const [customers, equipments, engineers, materials] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
			.where(inTenant(customer))
			.orderBy(asc(customer.name)),
		db
			.select({
				id: equipment.id,
				customerId: equipment.customerId,
				model: equipment.model,
				manufacturer: equipment.manufacturer,
				serialNumber: equipment.serialNumber,
			})
			.from(equipment)
			.where(inTenant(equipment))
			.orderBy(asc(equipment.manufacturer), asc(equipment.model)),
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
		db
			.select({
				id: material.id,
				sku: material.sku,
				name: material.name,
				unit: material.unit,
				unitPrice: material.unitPrice,
			})
			.from(material)
			.where(inTenant(material))
			.orderBy(asc(material.name)),
	]);
	return { customers, equipments, engineers, materials };
});

const orderSchema = v.object(orderFields);

type OrderInput = v.InferOutput<typeof orderSchema>;

type OrderIssue = RemoteFormInvalidField<v.InferInput<typeof orderSchema>>;

/**
 * Creates or updates an order in the current tenant and replaces its lines; returns its number.
 * The lines take their materials from stock while the status holds stock (see `holdsStock`); if
 * there isn't enough, throws an `OrderStockShortage` (see `refuseShortage`).
 */
async function saveOrder(id: number | null, input: OrderInput) {
	const { organizationId } = requireMember();
	const { lines, scheduledTime, ...fields } = input;

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.order.findFirst({
					where: idInTenant(order, id),
					with: { lines: true },
				})
			: undefined;
		if (id && !existing) error(404, m.orders_not_found_plain());
		if (existing && !isEditableOrder(existing.status)) {
			invalid(notEditable(existing.number, "changed"));
		}

		const values = {
			...fields,
			scheduledFor: fields.scheduledFor && atTime(fields.scheduledFor, scheduledTime ?? "00:00"),
			// Keep the original completion date; set or clear it when the status changes.
			completedAt: completedAt(fields.status, existing),
		};

		let orderId: number;
		let number: string;
		if (existing) {
			orderId = existing.id;
			number = existing.number;
			await tx.update(order).set(values).where(idInTenant(order, orderId));
		} else {
			number = await nextNumber(tx, "order");
			const [inserted] = await tx
				.insert(order)
				.values({ ...values, organizationId, number })
				.returning({ id: order.id });
			orderId = inserted.id;
		}

		// The lines take their materials from stock, or return them, as the status says.
		await saveOrderLines(tx, { id: orderId, number }, existing, {
			status: fields.status,
			lines,
		});
		// Its lines are logged by `saveOrderLines`; the completion date follows from the status.
		const subject = { type: "order", id: orderId, label: number };
		const action = existing ? "updated" : "created";
		const ignore = ["completedAt"];
		await recordActivity(tx, { action, subject, before: existing, after: values, ignore });
		return number;
	});
}

/** Refuses the form with an issue on the line whose material there isn't enough of in stock. */
function refuseShortage(
	issue: OrderIssue,
	lines: LineInput[],
	shortage: OrderStockShortage,
): never {
	const line = lines.findLastIndex((line) => line.materialId === shortage.materialId);
	invalid(issue.lines[line].quantity(shortage.message));
}

interface ReferenceProblem {
	field: "customerId" | "equipmentId" | "engineerId";
	message: string;
}

/** Checks that the order's references exist in the current tenant and belong together. */
async function checkReferences(input: OrderInput): Promise<ReferenceProblem[]> {
	const problems: ReferenceProblem[] = [];
	const [found, unit, assignee] = await Promise.all([
		db.query.customer.findFirst({
			columns: { id: true },
			where: idInTenant(customer, input.customerId),
		}),
		input.equipmentId
			? db.query.equipment.findFirst({
					columns: { customerId: true },
					where: idInTenant(equipment, input.equipmentId),
				})
			: undefined,
		input.engineerId
			? db.query.engineer.findFirst({
					columns: { id: true },
					where: idInTenant(engineer, input.engineerId),
				})
			: undefined,
	]);
	if (!found) problems.push({ field: "customerId", message: m.orders_unknown_customer() });
	if (input.equipmentId && unit?.customerId !== input.customerId) {
		problems.push({ field: "equipmentId", message: m.orders_equipment_other_customer() });
	}
	if (input.engineerId && !assignee) {
		problems.push({ field: "engineerId", message: m.orders_unknown_engineer() });
	}
	return problems;
}

/** The form issue for a problem with one of the submitted lines. */
const lineIssue = (issue: OrderIssue, { line, field, message }: LineProblem) =>
	issue.lines[line][field](message);

/** Refuses the form if the order's references or lines are wrong, each problem on its field. */
async function refuseProblems(issue: OrderIssue, input: OrderInput) {
	const [problems, lineProblems] = await Promise.all([
		checkReferences(input),
		checkLines(input.lines),
	]);
	if (problems.length || lineProblems.length) {
		invalid(
			...problems.map(({ field, message }) => issue[field](message)),
			...lineProblems.map((problem) => lineIssue(issue, problem)),
		);
	}
}

export const createOrder = form(orderSchema, async (input, issue) => {
	requireMember();
	await refuseProblems(issue, input);
	const number = await saveOrder(null, input).catch((error) => {
		if (error instanceof OrderStockShortage) refuseShortage(issue, input.lines, error);
		throw error;
	});
	redirect(303, `/orders/${number}`);
});

export const updateOrder = form(v.object({ id: id(), ...orderFields }), async (data, issue) => {
	requireMember();
	const { id, ...input } = data;
	await refuseProblems(issue, input);
	const number = await saveOrder(id, input).catch((error) => {
		if (error instanceof OrderStockShortage) refuseShortage(issue, input.lines, error);
		throw error;
	});
	void getOrder(number).refresh();
	orderCommitted({ number });
	redirect(303, `/orders/${number}`);
});

export const deleteOrder = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeOrder(id);
	redirect(303, "/orders");
});
