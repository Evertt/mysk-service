import { command, form, query, type RemoteFormInvalidField, requested } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	ne,
	type SQL,
	sql,
	type SQLWrapper,
} from "drizzle-orm";
import * as v from "valibot";

import {
	isDoneOrder,
	isEditableOrder,
	lineTotal,
	manualOrderStatuses,
	type OrderStatus,
	orderPriorities,
} from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { atTime, id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { bulkTarget, type BulkTargetInput, forEachRecord, targetIds } from "#lib/server/bulk.js";
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
import {
	assigneeProblem,
	checkLines,
	type LineProblem,
	saveOrderLines,
} from "#lib/server/orders.js";
import { priceOrders, STANDARD_HOURLY_RATE } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { moveOrderStock, OrderStockShortage } from "#lib/server/stock.js";
import {
	facetCounts,
	nocase,
	oneOf,
	planTable,
	rank,
	type ServerTable,
	tableParams,
} from "#lib/server/table-query.js";

import { orderFields } from "./order-schema.js";
import { ordersUrl } from "./orders-url.js";

/** The orders list's columns in SQL, for its URL state (`ordersUrl`). */
const ordersTable: ServerTable = {
	spec: ordersUrl,
	columns: {
		number: { sort: order.number },
		customer: { sort: nocase(customer.name), filter: oneOf(customer.code) },
		equipment: {
			sort: [nocase(equipment.manufacturer), nocase(equipment.model)],
			nullsLast: true,
			filter: oneOf(equipment.serialNumber),
		},
		type: { sort: order.type, filter: oneOf(order.type) },
		status: { sort: order.status, filter: oneOf(order.status) },
		// By urgency rather than alphabetically.
		priority: { sort: rank(order.priority, orderPriorities), filter: oneOf(order.priority) },
		engineer: {
			sort: nocase(engineer.name),
			nullsLast: true,
			filter: (ids) => inArray(order.engineerId, ids.map(Number).filter(Number.isSafeInteger)),
		},
		scheduledFor: { sort: order.scheduledFor, nullsLast: true },
		createdAt: { sort: order.createdAt },
	},
	search: [
		order.number,
		customer.name,
		customer.code,
		equipment.manufacturer,
		equipment.model,
		equipment.serialNumber,
		engineer.name,
	],
	tieBreaker: order.id,
	scope: () => inTenant(order),
};

/**
 * How many orders match `where` (with their customer, unit and engineer, as in the list): in all,
 * or per value of `by`.
 */
function countOrders(where: SQL | undefined, by?: SQLWrapper) {
	const counted = db
		.select({ value: sql<unknown>`${by ?? sql`null`}`, count: count() })
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(where);
	return by ? counted.groupBy(sql`${by}`) : counted;
}

/**
 * A page of the orders list with their customer, equipment, engineer and totals, searched,
 * filtered and sorted as the URL's parameters say (`ordersUrl`, e.g. `status=quote&page=2`), and
 * how many orders match in all.
 */
export const getOrders = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(ordersTable, params);
	const [rows, [{ count: rowCount }]] = await Promise.all([
		db
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
			})
			.from(order)
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
			.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
			.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
			.where(plan.where())
			.orderBy(...plan.orderBy)
			.limit(plan.limit)
			.offset(plan.offset),
		countOrders(plan.where()),
	]);

	// The page's lines (only), to price it.
	const ids = rows.map((row) => row.id);
	const lines = ids.length
		? await db
				.select({
					orderId: orderLine.orderId,
					count: count(),
					total: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`,
				})
				.from(orderLine)
				.where(and(inTenant(orderLine), inArray(orderLine.orderId, ids)))
				.groupBy(orderLine.orderId)
		: [];
	const linesOf = new Map(lines.map((line) => [line.orderId, line]));

	const page = rows.map((row) => ({
		...row,
		lineCount: linesOf.get(row.id)?.count ?? 0,
		materialsTotal: linesOf.get(row.id)?.total ?? 0,
	}));
	const facts = page.map((row) => ({
		...row,
		equipmentId: row.equipment?.id ?? null,
		materials: row.materialsTotal,
		hourlyRate: row.engineer?.hourlyRate,
	}));
	const [prices, tags] = await Promise.all([priceOrders(facts), tagOrders(facts)]);
	return {
		rows: page.map((row, i) => ({
			...row,
			laborTotal: prices[i].labor,
			total: prices[i].total,
			/** From the tenant's modules, e.g. a response time about to be missed. */
			tags: tags[i],
		})),
		rowCount,
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
	};
});

/**
 * How many orders have each type, status and priority, for the counts in the list's filters: of
 * those matching the search and the other filters in the URL's parameters.
 */
export const getOrderFacets = query(tableParams, async (params) => {
	requireMember();
	return facetCounts(
		planTable(ordersTable, params),
		{ type: order.type, status: order.status, priority: order.priority },
		countOrders,
	);
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

/** When an order with `status` was completed: kept from before, set when it's done, else none. */
const completedAt = (status: OrderStatus, existing?: { completedAt: Date | null }) =>
	isDoneOrder(status) ? (existing?.completedAt ?? new Date()) : null;

/**
 * Creates or updates an order in the current tenant and replaces its lines; returns its number.
 * The lines take their materials from stock while the status holds stock (see `holdsStock`); if
 * there isn't enough, refuses with an issue on the line.
 */
async function saveOrder(id: number | null, input: OrderInput, issue: OrderIssue) {
	const { organizationId } = requireMember();
	const { lines, scheduledTime, ...fields } = input;

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
			completedAt: completedAt(fields.status, existing),
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
	redirect(303, `/orders/${number}`);
});

export const updateOrder = form(v.object({ id: id(), ...orderFields }), async (data, issue) => {
	requireMember();
	const { id, ...input } = data;
	const problems = await checkReferences(input);
	if (problems.length) invalid(...problems.map((p) => toIssue(issue, p)));
	const number = await saveOrder(id, input, issue);
	void getOrder(number).refresh();
	orderSaved(number);
	redirect(303, `/orders/${number}`);
});

/**
 * Deletes one of the current tenant's orders; what it held goes back into stock. Refuses an
 * invoiced order, and one that an optional module's record (e.g. an invoice) still refers to; a
 * 404 if there's no such order. The order's page and the list's bulk delete share it.
 */
async function removeOrder(id: number) {
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
}

export const deleteOrder = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeOrder(id);
	redirect(303, "/orders");
});

// --- Bulk actions on the list's selected orders (see `bulk-actions.ts`) ------------------------

/** The ids of the tenant's orders matching the list's search and filters (`ordersUrl`). */
async function matchingOrderIds(params: string, limit: number) {
	const rows = await db
		.select({ id: order.id })
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(planTable(ordersTable, params).where())
		.orderBy(order.id)
		.limit(limit);
	return rows.map((row) => row.id);
}

/**
 * The orders a bulk action acts on, of the current tenant only (another tenant's ids aren't
 * found), and how many it asked for.
 */
async function targetOrders(target: BulkTargetInput) {
	const ids = await targetIds(target, matchingOrderIds);
	const found = await db
		.select({ id: order.id, number: order.number })
		.from(order)
		.where(and(inArray(order.id, ids), inTenant(order)))
		.orderBy(order.number);
	return { found, asked: ids.length };
}

/** Refreshes the pages of the list and its filters' counts that the client asked for. */
async function refreshList() {
	await requested(getOrders, 4).refreshAll();
	await requested(getOrderFacets, 4).refreshAll();
}

/**
 * Gives one of the tenant's orders another status, as saving it in the order form would: not an
 * invoiced one; its completion date set or cleared; its materials taken from or returned to stock
 * (refused if there isn't enough). A 404 if there's no such order.
 */
async function changeOrderStatus(id: number, status: OrderStatus) {
	try {
		await db.transaction(async (tx) => {
			const found = await tx.query.order.findFirst({
				where: and(eq(order.id, id), inTenant(order)),
				with: { lines: true },
			});
			if (!found) error(404, m.orders_not_found_plain());
			if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "changed"));
			if (found.status === status) return;
			const values = { status, completedAt: completedAt(status, found) };
			await tx
				.update(order)
				.set(values)
				.where(and(eq(order.id, id), inTenant(order)));
			await moveOrderStock(tx, found, found, { status, lines: found.lines });
			const subject = { type: "order", id, label: found.number };
			const ignore = ["completedAt"];
			await recordActivity(tx, {
				action: "updated",
				subject,
				before: found,
				after: values,
				ignore,
			});
		});
	} catch (error) {
		// Thrown, so the transaction stores nothing of it.
		if (error instanceof OrderStockShortage) invalid(error.message);
		throw error;
	}
}

/** Assigns one of the tenant's orders to an engineer (checked already), or to nobody. */
async function assignOrder(id: number, engineerId: number | null) {
	await db.transaction(async (tx) => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true, engineerId: true },
			where: and(eq(order.id, id), inTenant(order)),
		});
		if (!found) error(404, m.orders_not_found_plain());
		if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "changed"));
		if (found.engineerId === engineerId) return;
		await tx
			.update(order)
			.set({ engineerId })
			.where(and(eq(order.id, id), inTenant(order)));
		const subject = { type: "order", id, label: found.number };
		await recordActivity(tx, { action: "updated", subject, before: found, after: { engineerId } });
	});
}

/** The tenant's active engineers, to assign orders to. */
export const getAssignableEngineers = query(async () => {
	requireMember();
	return db
		.select({ id: engineer.id, name: engineer.name })
		.from(engineer)
		.where(and(inTenant(engineer), eq(engineer.active, true)))
		.orderBy(asc(engineer.name));
});

/** Assigns the selected orders to an active engineer of the tenant, or to nobody (`null`). */
export const bulkAssignOrders = command(
	v.object({ target: bulkTarget, engineerId: v.nullable(v.pipe(v.number(), v.integer())) }),
	async ({ target, engineerId }) => {
		requireMember();
		if (engineerId !== null) {
			const problem = await assigneeProblem(engineerId);
			if (problem) error(400, problem);
		}
		const { found, asked } = await targetOrders(target);
		const result = await forEachRecord(
			found,
			asked,
			(o) => o.number,
			(o) => assignOrder(o.id, engineerId),
		);
		await refreshList();
		return result;
	},
);

/** Gives the selected orders a status that can be given by hand (`manualOrderStatuses`). */
export const bulkSetOrderStatus = command(
	v.object({ target: bulkTarget, status: v.picklist(manualOrderStatuses) }),
	async ({ target, status }) => {
		requireMember();
		const { found, asked } = await targetOrders(target);
		const result = await forEachRecord(
			found,
			asked,
			(o) => o.number,
			(o) => changeOrderStatus(o.id, status),
		);
		await refreshList();
		return result;
	},
);

/** Deletes the selected orders, with the same refusals as deleting one. */
export const bulkDeleteOrders = command(bulkTarget, async (target) => {
	requireMember();
	const { found, asked } = await targetOrders(target);
	const result = await forEachRecord(
		found,
		asked,
		(o) => o.number,
		(o) => removeOrder(o.id),
	);
	await refreshList();
	return result;
});
