import { form, query, type RemoteFormInvalidField } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { isDoneOrder, isEditableOrder, lineTotal } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { atTime, id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import {
	customer,
	engineer,
	equipment,
	material,
	order,
	orderLine,
	stockMovement,
} from "#lib/server/db/schema.js";
import { orderSaved, tagOrders } from "#lib/server/modules.js";
import { checkLines, type LineProblem, saveOrderLines } from "#lib/server/orders.js";
import { priceOrders, STANDARD_HOURLY_RATE } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { moveOrderStock, OrderStockShortage } from "#lib/server/stock.js";

import { orderFields } from "./order-schema.js";

/** All orders with their customer, equipment, engineer and totals, newest first. */
export const getOrders = query(async () => {
	requireMember();
	const lines = db
		.select({
			orderId: orderLine.orderId,
			count: count().as("line_count"),
			total: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`.as(
				"line_total",
			),
		})
		.from(orderLine)
		.where(inTenant(orderLine))
		.groupBy(orderLine.orderId)
		.as("lines");

	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			priority: order.priority,
			description: order.description,
			scheduledFor: order.scheduledFor,
			completedAt: order.completedAt,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			equipment: {
				id: equipment.id,
				model: equipment.model,
				manufacturer: equipment.manufacturer,
				serialNumber: equipment.serialNumber,
			},
			engineer: { id: engineer.id, name: engineer.name, hourlyRate: engineer.hourlyRate },
			lineCount: sql<number>`coalesce(${lines.count}, 0)`,
			materialsTotal: sql<number>`coalesce(${lines.total}, 0)`,
		})
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.leftJoin(lines, eq(lines.orderId, order.id))
		.where(inTenant(order))
		.orderBy(desc(order.createdAt));

	const facts = rows.map((row) => ({
		...row,
		equipmentId: row.equipment?.id ?? null,
		materials: row.materialsTotal,
		hourlyRate: row.engineer?.hourlyRate,
	}));
	const [prices, tags] = await Promise.all([priceOrders(facts), tagOrders(facts)]);
	return rows.map((row, i) => ({
		...row,
		laborTotal: prices[i].labor,
		total: prices[i].total,
		/** From the tenant's modules, e.g. a response time about to be missed. */
		tags: tags[i],
	}));
});

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

type OrderInput = v.InferOutput<v.ObjectSchema<typeof orderFields, undefined>>;

/** Why an order can't be changed or deleted (see `isEditableOrder`). */
const notEditable = (number: string, change: "changed" | "deleted") =>
	change === "changed"
		? m.orders_invoiced_cant_change({ number })
		: m.orders_invoiced_cant_delete({ number });

/**
 * Creates or updates an order in the current tenant and replaces its lines; returns its number.
 * The lines take their materials from stock while the status holds stock (see `holdsStock`); if
 * there isn't enough, refuses with an issue on the line.
 */
async function saveOrder(id: number | null, input: OrderInput, issue: OrderIssue) {
	const { organizationId } = requireMember();
	const { lines, scheduledTime, ...fields } = input;
	const completed = isDoneOrder(fields.status);

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.order.findFirst({
					where: and(eq(order.id, id), inTenant(order)),
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
			completedAt: completed ? (existing?.completedAt ?? new Date()) : null,
		};

		let orderId: number;
		let number: string;
		if (existing) {
			orderId = existing.id;
			number = existing.number;
			await tx
				.update(order)
				.set(values)
				.where(and(eq(order.id, orderId), inTenant(order)));
		} else {
			// Numbers are sequential per tenant, across years: ORD-2026-00001, ORD-2026-00002, …
			const [{ last }] = await tx
				.select({ last: sql<number | null>`max(cast(substr(${order.number}, 10) as integer))` })
				.from(order)
				.where(inTenant(order));
			number = `ORD-${new Date().getFullYear()}-${String((last ?? 0) + 1).padStart(5, "0")}`;
			const [inserted] = await tx
				.insert(order)
				.values({ ...values, organizationId, number })
				.returning({ id: order.id });
			orderId = inserted.id;
		}

		// The lines take their materials from stock, or return them, as the status says.
		try {
			await saveOrderLines(tx, { id: orderId, number }, existing, {
				status: fields.status,
				lines,
			});
		} catch (error) {
			if (!(error instanceof OrderStockShortage)) throw error;
			invalid(
				toIssue(issue, {
					line: lines.findLastIndex((line) => line.materialId === error.materialId),
					field: "quantity",
					message: error.message,
				}),
			);
		}
		// Its lines are logged by `saveOrderLines`; the completion date follows from the status.
		const subject = { type: "order", id: orderId, label: number };
		const action = existing ? "updated" : "created";
		const ignore = ["completedAt"];
		await recordActivity(tx, { action, subject, before: existing, after: values, ignore });
		return number;
	});
}

type Problem =
	| { field: "customerId" | "equipmentId" | "engineerId"; message: string }
	| LineProblem;

/** Checks that the order's references exist in the current tenant and belong together. */
async function checkReferences(input: OrderInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	const [found, unit, assignee, lineProblems] = await Promise.all([
		db.query.customer.findFirst({
			columns: { id: true },
			where: and(eq(customer.id, input.customerId), inTenant(customer)),
		}),
		input.equipmentId
			? db.query.equipment.findFirst({
					columns: { customerId: true },
					where: and(eq(equipment.id, input.equipmentId), inTenant(equipment)),
				})
			: undefined,
		input.engineerId
			? db.query.engineer.findFirst({
					columns: { id: true },
					where: and(eq(engineer.id, input.engineerId), inTenant(engineer)),
				})
			: undefined,
		checkLines(input.lines),
	]);
	if (!found) problems.push({ field: "customerId", message: m.orders_unknown_customer() });
	if (input.equipmentId && unit?.customerId !== input.customerId) {
		problems.push({ field: "equipmentId", message: m.orders_equipment_other_customer() });
	}
	if (input.engineerId && !assignee) {
		problems.push({ field: "engineerId", message: m.orders_unknown_engineer() });
	}
	return [...problems, ...lineProblems];
}

const orderSchema = v.object(orderFields);

type OrderIssue = RemoteFormInvalidField<v.InferInput<typeof orderSchema>>;

/** The form issue for a problem found by `checkReferences` (or by `saveOrder`). */
function toIssue(issue: OrderIssue, problem: Problem) {
	return "line" in problem
		? issue.lines[problem.line][problem.field](problem.message)
		: issue[problem.field](problem.message);
}

export const createOrder = form(orderSchema, async (input, issue) => {
	requireMember();
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => toIssue(issue, p)));
	const number = await saveOrder(null, input, issue);
	void getOrders().refresh();
	redirect(303, `/orders/${number}`);
});

export const updateOrder = form(v.object({ id: id(), ...orderFields }), async (data, issue) => {
	requireMember();
	const { id, ...input } = data;
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => toIssue(issue, p)));
	const number = await saveOrder(id, input, issue);
	void getOrders().refresh();
	void getOrder(number).refresh();
	orderSaved(number);
	redirect(303, `/orders/${number}`);
});

export const deleteOrder = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	const deleting = db.transaction(async (tx) => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true },
			where: and(eq(order.id, id), inTenant(order)),
			with: { lines: true },
		});
		if (!found) error(404, m.orders_not_found_plain());
		if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "deleted"));
		// What it held goes back into stock. The stock history keeps the order's number, but no
		// longer refers to the order itself.
		// The note is stored, in the language of whoever deletes it.
		const note = m.orders_stock_note_deleted();
		await moveOrderStock(tx, found, found, { status: found.status, lines: [] }, note);
		await tx
			.update(stockMovement)
			.set({ orderId: null })
			.where(and(eq(stockMovement.orderId, found.id), inTenant(stockMovement)));
		await tx.delete(order).where(and(eq(order.id, found.id), inTenant(order)));
		await recordActivity(tx, {
			action: "deleted",
			subject: { type: "order", id, label: found.number },
		});
	});
	// E.g. an optional module's record, such as an invoice, may still refer to it.
	await refuseIfReferenced(() => deleting, m.orders_delete_referenced());
	void getOrders().refresh();
	redirect(303, "/orders");
});
