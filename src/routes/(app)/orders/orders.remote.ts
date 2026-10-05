import { form, query, type RemoteFormInvalidField } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.js";
import { db } from "#lib/server/db/index.js";
import {
	customer,
	engineer,
	equipment,
	material,
	order,
	orderLine,
} from "#lib/server/db/schema.js";
import { laborCost, STANDARD_HOURLY_RATE } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";

import { orderFields } from "./order-schema.js";

/** All orders with their customer, equipment, engineer and totals, newest first. */
export const getOrders = query(async () => {
	requireMember();
	const lines = db
		.select({
			orderId: orderLine.orderId,
			count: count().as("line_count"),
			total: sql<number>`sum(${orderLine.quantity} * ${orderLine.unitPrice})`.as("line_total"),
		})
		.from(orderLine)
		.innerJoin(order, and(eq(orderLine.orderId, order.id), inTenant(order)))
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

	return rows.map((row) => {
		const laborTotal = laborCost(row.laborHours, row.engineer?.hourlyRate);
		return { ...row, laborTotal, total: row.materialsTotal + laborTotal };
	});
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
	if (!found) error(404, `Order ${number} not found`);

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

	const lines = found.lines.map((line) => ({ ...line, total: line.quantity * line.unitPrice }));
	const materialsTotal = lines.reduce((sum, line) => sum + line.total, 0);
	const laborTotal = laborCost(found.laborHours, found.engineer?.hourlyRate);

	return {
		order: { ...found, lines },
		totals: {
			materials: materialsTotal,
			laborRate: found.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE,
			labor: laborTotal,
			total: materialsTotal + laborTotal,
		},
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

/** Creates or updates an order in the current tenant and replaces its lines; returns its number. */
async function saveOrder(id: number | null, input: OrderInput) {
	const { organizationId } = requireMember();
	const { lines, ...fields } = input;
	const completed = fields.status === "completed" || fields.status === "invoiced";

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.order.findFirst({
					where: and(eq(order.id, id), inTenant(order)),
					with: { lines: true },
				})
			: undefined;
		if (id && !existing) error(404, "Order not found");

		const values = {
			...fields,
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
			await tx.delete(orderLine).where(eq(orderLine.orderId, orderId));
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

		if (lines.length) {
			// Lines keep the price they were quoted at; new materials get today's price.
			const quoted = new Map(existing?.lines.map((line) => [line.materialId, line.unitPrice]));
			const prices = new Map(
				(
					await tx
						.select({ id: material.id, unitPrice: material.unitPrice })
						.from(material)
						.where(
							and(
								inArray(
									material.id,
									lines.map((line) => line.materialId),
								),
								inTenant(material),
							),
						)
				).map((row) => [row.id, row.unitPrice]),
			);
			await tx.insert(orderLine).values(
				lines.map((line) => ({
					orderId,
					materialId: line.materialId,
					quantity: line.quantity,
					unitPrice: quoted.get(line.materialId) ?? prices.get(line.materialId) ?? 0,
				})),
			);
		}
		return number;
	});
}

type Problem =
	| { field: "customerId" | "equipmentId" | "engineerId"; message: string }
	| { line: number; message: string };

/** Checks that the order's references exist in the current tenant and belong together. */
async function checkReferences(input: OrderInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	const [found, unit, assignee, materials] = await Promise.all([
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
		input.lines.length
			? db
					.select({ id: material.id })
					.from(material)
					.where(
						and(
							inArray(
								material.id,
								input.lines.map((line) => line.materialId),
							),
							inTenant(material),
						),
					)
			: [],
	]);
	if (!found) problems.push({ field: "customerId", message: "Unknown customer" });
	if (input.equipmentId && unit?.customerId !== input.customerId) {
		problems.push({ field: "equipmentId", message: "This equipment belongs to another customer" });
	}
	if (input.engineerId && !assignee) {
		problems.push({ field: "engineerId", message: "Unknown engineer" });
	}
	const known = new Set(materials.map((row) => row.id));
	input.lines.forEach((line, index) => {
		if (!known.has(line.materialId)) problems.push({ line: index, message: "Unknown material" });
	});
	return problems;
}

const orderSchema = v.object(orderFields);

/** The form issue for a problem found by `checkReferences`. */
function toIssue(
	issue: RemoteFormInvalidField<v.InferInput<typeof orderSchema>>,
	problem: Problem,
) {
	return "line" in problem
		? issue.lines[problem.line].materialId(problem.message)
		: issue[problem.field](problem.message);
}

export const createOrder = form(orderSchema, async (input, issue) => {
	requireMember();
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => toIssue(issue, p)));
	const number = await saveOrder(null, input);
	void getOrders().refresh();
	redirect(303, `/orders/${number}`);
});

export const updateOrder = form(v.object({ id: id(), ...orderFields }), async (data, issue) => {
	requireMember();
	const { id, ...input } = data;
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => toIssue(issue, p)));
	const number = await saveOrder(id, input);
	void getOrders().refresh();
	void getOrder(number).refresh();
	redirect(303, `/orders/${number}`);
});

export const deleteOrder = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	const deleted = await db
		.delete(order)
		.where(and(eq(order.id, id), inTenant(order)))
		.returning({ id: order.id });
	if (!deleted.length) error(404, "Order not found");
	void getOrders().refresh();
	redirect(303, "/orders");
});
