import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import * as v from "valibot";

import { isDoneOrder, isOpenOrder, openOrderStatuses } from "#lib/models.js";
import { id } from "#lib/schema.js";
import { deleteOrRefuse } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { laborCost } from "#lib/server/pricing.js";
import { requireUser } from "#lib/server/session.js";

import { equipmentFields } from "./equipment-schema.js";

const orders = (n: number) => (n === 1 ? "1 order" : `${n} orders`);

/** All units with their owner and number of open orders. */
export const getEquipmentList = query(async () => {
	requireUser();
	const open = db
		.select({ equipmentId: order.equipmentId, count: count().as("open_count") })
		.from(order)
		.where(inArray(order.status, openOrderStatuses))
		.groupBy(order.equipmentId)
		.as("open_orders");

	return db
		.select({
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
			category: equipment.category,
			status: equipment.status,
			installedAt: equipment.installedAt,
			warrantyUntil: equipment.warrantyUntil,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			openOrders: sql<number>`coalesce(${open.count}, 0)`,
		})
		.from(equipment)
		.innerJoin(customer, eq(equipment.customerId, customer.id))
		.leftJoin(open, eq(open.equipmentId, equipment.id))
		.orderBy(asc(equipment.manufacturer), asc(equipment.model));
});

/** One unit with its owner and service history (most recent first). */
export const getEquipment = query(v.string(), async (serialNumber) => {
	requireUser();
	const found = await db.query.equipment.findFirst({
		where: eq(equipment.serialNumber, serialNumber),
		with: {
			customer: true,
			orders: {
				with: {
					engineer: { columns: { hourlyRate: true } },
					lines: { columns: { quantity: true, unitPrice: true } },
				},
				orderBy: (order, { desc }) => [desc(order.createdAt), desc(order.id)],
			},
		},
	});
	if (!found) error(404, `Equipment ${serialNumber} not found`);

	const { orders: rows, ...unit } = found;
	const history = rows.map(({ engineer, lines, ...row }) => {
		const materials = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
		return { ...row, total: materials + laborCost(row.laborHours, engineer?.hourlyRate) };
	});
	const completed = history
		.filter((row) => isDoneOrder(row.status) && row.completedAt)
		.map((row) => row.completedAt as Date);

	return {
		unit,
		history,
		openOrders: history.filter((row) => isOpenOrder(row.status)).length,
		lastService: completed.length
			? new Date(Math.max(...completed.map((date) => date.getTime())))
			: null,
	};
});

/** Everything the equipment form needs to choose from. */
export const getEquipmentFormOptions = query(async () => {
	requireUser();
	const customers = await db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.orderBy(asc(customer.name));
	return { customers };
});

type EquipmentInput = v.InferOutput<v.ObjectSchema<typeof equipmentFields, undefined>>;
type Problem = {
	field: "serialNumber" | "customerId" | "warrantyUntil";
	message: string;
};

/** Checks what the schema can't: uniqueness, references and moving a unit with orders. */
async function checkUnit(
	existing: typeof equipment.$inferSelect | undefined,
	input: EquipmentInput,
): Promise<Problem[]> {
	const problems: Problem[] = [];
	const sameSerial = await db.query.equipment.findFirst({
		columns: { id: true },
		where: eq(equipment.serialNumber, input.serialNumber),
	});
	if (sameSerial && sameSerial.id !== existing?.id) {
		problems.push({
			field: "serialNumber",
			message: "Another unit already has this serial number",
		});
	}
	if (!(await db.query.customer.findFirst({ where: eq(customer.id, input.customerId) }))) {
		problems.push({ field: "customerId", message: "Unknown customer" });
	} else if (existing && existing.customerId !== input.customerId) {
		const [{ total }] = await db
			.select({ total: count() })
			.from(order)
			.where(eq(order.equipmentId, existing.id));
		if (total) {
			problems.push({
				field: "customerId",
				message: `Can't move this unit to another customer: ${orders(total)} for its current owner refer to it.`,
			});
		}
	}
	if (input.warrantyUntil < input.installedAt) {
		problems.push({
			field: "warrantyUntil",
			message: "The warranty can't end before the unit was installed",
		});
	}
	return problems;
}

export const createEquipment = form(v.object(equipmentFields), async (input, issue) => {
	requireUser();
	const problems = await checkUnit(undefined, input);
	if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
	await db.insert(equipment).values(input);
	void getEquipmentList().refresh();
	redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
});

export const updateEquipment = form(
	v.object({ id: id(), ...equipmentFields }),
	async (data, issue) => {
		requireUser();
		const { id, ...input } = data;
		const existing = await db.query.equipment.findFirst({ where: eq(equipment.id, id) });
		if (!existing) error(404, "Equipment not found");
		const problems = await checkUnit(existing, input);
		if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
		await db.update(equipment).set(input).where(eq(equipment.id, id));
		void getEquipmentList().refresh();
		void getEquipment(input.serialNumber).refresh();
		redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
	},
);

export const deleteEquipment = form(v.object({ id: id() }), async ({ id }) => {
	requireUser();
	const [{ total }] = await db
		.select({ total: count() })
		.from(order)
		.where(eq(order.equipmentId, id));
	if (total) {
		invalid(
			`This unit can't be deleted: ${orders(total)} refer to it. Set its status to decommissioned instead.`,
		);
	}
	await deleteOrRefuse(
		() => db.delete(equipment).where(eq(equipment.id, id)),
		"Other records still refer to this unit. Remove those first.",
	);
	void getEquipmentList().refresh();
	redirect(303, "/equipment");
});
