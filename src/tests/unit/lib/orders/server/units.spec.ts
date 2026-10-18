/**
 * An order about several units, as North's planner makes it: the list shows its first unit and
 * how many more and finds it by any of them, each unit's service history has it at its share of
 * the cost, and the engineer it's planned for gets all its units and their sites. The server side
 * of `src/tests/e2e/orders.units.test.ts`, which keeps the form, the order's page and the log.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getServiceHistory } from "#lib/equipment/detail/service-history.remote.ts";
import { unitShare } from "#lib/equipment/detail/service-history.ts";
import { getOrders } from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import { createOrder, updateOrder } from "#lib/orders/order.remote.ts";
import { getMyOrder } from "#routes/(field)/my/portal.remote.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { editForm, orderId } from "./order-form.test-support.ts";

const northId = organizationId("north");

type Query = Parameters<typeof getOrders>[0];
const listed = (changes: Partial<Query>) =>
	as(north.member, () =>
		data(getOrders, {
			q: "",
			filters: {},
			sort: [{ id: "createdAt", desc: true }],
			group: null,
			pageIndex: 0,
			pageSize: ordersList.pageSize,
			...changes,
		} as Query),
	);

interface Unit {
	id: number;
	serial: string;
	site: string;
	access: string | null;
}

/** Three units of North's customer with the most, in the order they're put on the order. */
let units: Unit[];
let number: string;

beforeAll(async () => {
	const owner = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 order by (select count(*) from equipment e where e.customer_id = c.id) desc, c.id limit 1`,
		[northId],
	);
	units = await rows<Unit>(
		`select e.id, e.serial_number as serial, s.name as site, s.access_notes as access
		 from equipment e join customer_site s on s.id = e.site_id
		 where e.customer_id = ? order by e.id limit 3`,
		[owner],
	);
	expect(units).toHaveLength(3);
	const created = await as(north.member, () =>
		submit(createOrder, {
			customerId: String(owner),
			equipmentIds: units.map((unit) => String(unit.id)),
			engineerId: "",
			type: "inspection",
			status: "quote",
			priority: "normal",
			description: "Yearly inspection of the doors (test order)",
			scheduledFor: "",
			scheduledTime: "",
			laborHours: 2,
		}),
	);
	expect(created).toMatchObject({
		status: 303,
		location: expect.stringMatching(/^\/orders\/ORD-/),
	});
	number = created.location!.split("/").pop()!;
});

describe("an order about several units", () => {
	test("is listed with its first unit and how many it has", async () => {
		const { rows: found } = await listed({ q: number });
		expect(found).toHaveLength(1);
		expect(found[0].equipment?.id).toBe(units[0].id);
		expect(found[0].unitCount).toBe(3);
	});

	test("is found by any of its units, in the search and the equipment filter", async () => {
		const second = units[1];
		expect((await listed({ q: second.serial })).rows.map((row) => row.number)).toContain(number);
		const withUnit = Number(
			await value(
				`select count(*) from order_unit u join "order" o on o.id = u.order_id
				 where u.equipment_id = ? and o.organization_id = ?`,
				[second.id, northId],
			),
		);
		const filtered = await listed({ filters: { equipment: [second.serial] } });
		expect(filtered.rowCount).toBe(withUnit);
		// The newest, first.
		expect(filtered.rows[0].number).toBe(number);
	});

	test("is in each unit's service history, at the unit's share of its cost", async () => {
		for (const unit of units) {
			const { events } = await as(north.member, () => data(getServiceHistory, unit.serial));
			const entry = events.find((event) => event.kind === "order" && event.order.number === number);
			expect(entry?.kind).toBe("order");
			if (entry?.kind !== "order") continue;
			expect(entry.order.units).toBe(3);
			expect(entry.order.cost.total).toBeGreaterThan(0);
			expect(unitShare(entry.order)).toBe(Math.round(entry.order.cost.total / 3));
		}
	});

	test("the engineer it's planned for gets all its units, in their order, and their sites", async () => {
		const engineerId = await value<number>(
			`select e.id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[north.engineer.email, northId],
		);
		const tomorrow = Temporal.Now.plainDateISO().add({ days: 1 }).toString();
		const planned = await as(north.member, async () =>
			submit(
				updateOrder,
				await editForm(north.member, number, {
					status: "scheduled",
					engineerId: String(engineerId),
					scheduledFor: tomorrow,
				}),
			),
		);
		expect(planned.status).toBe(303);
		expect(
			await value(`select engineer_id from "order" where id = ?`, [await orderId(number, northId)]),
		).toBe(engineerId);

		const mine = await as(north.engineer, () => data(getMyOrder, number));
		expect(mine.order.units.map((unit) => unit.serialNumber)).toEqual(units.map((u) => u.serial));
		expect(mine.sites.map((site) => site.name).toSorted()).toEqual(
			[...new Set(units.map((unit) => unit.site))].toSorted(),
		);
		for (const unit of units) {
			if (unit.access) {
				expect(mine.sites.find((site) => site.name === unit.site)?.accessNotes).toBe(unit.access);
			}
		}
	});
});
