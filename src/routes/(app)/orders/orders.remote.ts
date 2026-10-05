import { form, query } from "$app/server";
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
import { requireUser } from "#lib/server/session.js";

import { orderFields } from "./order-schema.js";

/** All orders with their customer, equipment, engineer and totals, newest first. */
export const getOrders = query(async () => {
	requireUser();
	const lines = db
		.select({
			orderId: orderLine.orderId,
			count: count().as("line_count"),
			total: sql<number>`sum(${orderLine.quantity} * ${orderLine.unitPrice})`.as("line_total"),
		})
		.from(orderLine)
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
		.innerJoin(customer, eq(order.customerId, customer.id))
		.leftJoin(equipment, eq(order.equipmentId, equipment.id))
		.leftJoin(engineer, eq(order.engineerId, engineer.id))
		.leftJoin(lines, eq(lines.orderId, order.id))
		.orderBy(desc(order.createdAt));

	return rows.map((row) => {
		const laborTotal = laborCost(row.laborHours, row.engineer?.hourlyRate);
		return { ...row, laborTotal, total: row.materialsTotal + laborTotal };
	});
});

/** One order with everything on it, plus other orders for the same equipment. */
export const getOrder = query(v.string(), async (number) => {
	requireUser();
	const found = await db.query.order.findFirst({
		where: eq(order.number, number),
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
				where: and(eq(order.equipmentId, found.equipmentId), ne(order.id, found.id)),
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
	requireUser();
	const [customers, equipments, engineers, materials] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
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
			.orderBy(asc(equipment.manufacturer), asc(equipment.model)),
		db
			.select({
				id: engineer.id,
				name: engineer.name,
				specialty: engineer.specialty,
				active: engineer.active,
			})
			.from(engineer)
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
			.orderBy(asc(material.name)),
	]);
	return { customers, equipments, engineers, materials };
});

type OrderInput = v.InferOutput<v.ObjectSchema<typeof orderFields, undefined>>;

/** Creates or updates an order and replaces its lines; returns the order number. */
async function saveOrder(id: number | null, input: OrderInput) {
	const { lines, ...fields } = input;
	const completed = fields.status === "completed" || fields.status === "invoiced";

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.order.findFirst({ where: eq(order.id, id), with: { lines: true } })
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
			await tx.update(order).set(values).where(eq(order.id, orderId));
			await tx.delete(orderLine).where(eq(orderLine.orderId, orderId));
		} else {
			// The number is derived from the id, which we only know after inserting.
			const [inserted] = await tx
				.insert(order)
				.values({ ...values, number: `pending-${crypto.randomUUID()}` })
				.returning({ id: order.id });
			orderId = inserted.id;
			number = `ORD-${new Date().getFullYear()}-${String(orderId).padStart(5, "0")}`;
			await tx.update(order).set({ number }).where(eq(order.id, orderId));
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
							inArray(
								material.id,
								lines.map((line) => line.materialId),
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

type Problem = { field: "customerId" | "equipmentId" | "engineerId"; message: string };

/** Checks that the order's references exist and belong together. */
async function checkReferences(input: OrderInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	if (!(await db.query.customer.findFirst({ where: eq(customer.id, input.customerId) }))) {
		problems.push({ field: "customerId", message: "Unknown customer" });
	}
	if (input.equipmentId) {
		const unit = await db.query.equipment.findFirst({ where: eq(equipment.id, input.equipmentId) });
		if (unit?.customerId !== input.customerId) {
			problems.push({
				field: "equipmentId",
				message: "This equipment belongs to another customer",
			});
		}
	}
	if (
		input.engineerId &&
		!(await db.query.engineer.findFirst({ where: eq(engineer.id, input.engineerId) }))
	) {
		problems.push({ field: "engineerId", message: "Unknown engineer" });
	}
	return problems;
}

export const createOrder = form(v.object(orderFields), async (input, issue) => {
	requireUser();
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
	const number = await saveOrder(null, input);
	redirect(303, `/orders/${number}`);
});

export const updateOrder = form(v.object({ id: id(), ...orderFields }), async (data, issue) => {
	requireUser();
	const { id, ...input } = data;
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
	const number = await saveOrder(id, input);
	redirect(303, `/orders/${number}`);
});

export const deleteOrder = form(v.object({ id: id() }), async ({ id }) => {
	requireUser();
	await db.delete(order).where(eq(order.id, id));
	redirect(303, "/orders");
});
