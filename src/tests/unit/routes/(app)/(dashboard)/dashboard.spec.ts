/**
 * The dashboard's queries on the seeded demo database: the tiles' numbers and what they compare
 * with the period before, the charts' orders per week, revenue per month and equipment by status,
 * the revenue priced alike in both, South's own numbers only, and the upcoming work's first unit
 * and how many more an order has. The server side of `src/tests/e2e/dashboard.test.ts`, which keeps
 * the greeting, the charts' and cards' rendering and layout.
 */
import { describe, expect, test } from "vite-plus/test";

import { equipmentStatuses, orderStatuses } from "#lib/models.ts";
import { updateOrder } from "#lib/orders/order.remote.ts";
import { getCharts, getDashboard } from "#routes/(app)/(dashboard)/dashboard.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { editForm } from "../../../lib/orders/server/order-form.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const zone = "Europe/Amsterdam";

const count = async (sql: string, args: (string | number)[]) => Number(await value(sql, args));

/** An organization's orders made between `from` and `to` days ago. */
const madeBetween = (organization: string, from: number, to: number) =>
	count(
		`select count(*) from "order" where organization_id = ?
		 and created_at >= unixepoch('now', ?) and created_at < unixepoch('now', ?)`,
		[organization, `-${from} days`, `-${to} days`],
	);

/** What the charts of `actor`'s organization should show of this week, this month and the fleet. */
async function expectChartsOf(actor: Actor, organization: string) {
	const today = Temporal.Now.plainDateISO(zone);
	const monday = today.subtract({ days: today.dayOfWeek - 1 });
	const since = monday.toZonedDateTime(zone).epochMilliseconds / 1000;
	const thisWeek = await rows<{ status: string; n: number }>(
		`select status, count(*) as n from "order" where organization_id = ? and created_at >= ?
		 group by status`,
		[organization, since],
	);
	const monthStart = today.with({ day: 1 }).toZonedDateTime(zone).epochMilliseconds / 1000;
	const completed = await count(
		`select count(*) from "order" where organization_id = ? and status in ('completed', 'invoiced')
		 and completed_at >= ?`,
		[organization, monthStart],
	);
	const charts = await as(actor, () => data(getCharts));
	expect(charts.ordersPerWeek).toHaveLength(12);
	const week = charts.ordersPerWeek.at(-1)!;
	expect(week.week.equals(monday)).toBe(true);
	for (const status of orderStatuses) {
		expect(week[status], status).toBe(thisWeek.find((row) => row.status === status)?.n ?? 0);
	}
	expect(charts.revenuePerMonth).toHaveLength(12);
	expect(charts.revenuePerMonth.at(-1)!.orders).toBe(completed);
	const fleet = await Promise.all(
		equipmentStatuses.map((status) =>
			count(`select count(*) from equipment where organization_id = ? and status = ?`, [
				organization,
				status,
			]),
		),
	);
	expect(charts.equipmentByStatus.map((row) => row.count)).toEqual(fleet);
	return charts;
}

describe("North's dashboard", () => {
	test("compares the orders made and the revenue with the period before", async () => {
		const { made, revenue } = await as(north.member, () => data(getDashboard));
		expect(made).toEqual({
			week: await madeBetween(northId, 7, 0),
			weekBefore: await madeBetween(northId, 14, 7),
		});
		// The seed completes work every week: there was revenue in the 30 days before too.
		expect(revenue.total).toBeGreaterThan(0);
		expect(revenue.previous).toBeGreaterThan(0);
	});

	test("charts North's orders per week, revenue per month and equipment by status", async () => {
		await expectChartsOf(north.member, northId);
	});

	test("prices the revenue alike in the tile and the chart: the year at least the last 30 days", async () => {
		const { revenue } = await as(north.member, () => data(getDashboard));
		const { revenuePerMonth } = await as(north.member, () => data(getCharts));
		const year = revenuePerMonth.reduce((sum, month) => sum + month.total, 0);
		expect(year).toBeGreaterThanOrEqual(revenue.total);
	});

	test("its upcoming work has each order's first unit, and how many it has", async () => {
		const units = (number: string) =>
			rows<{ id: number }>(
				`select u.equipment_id as id from order_unit u join "order" o on o.id = u.order_id
				 where o.number = ? and o.organization_id = ? order by u.position`,
				[number, northId],
			);
		const { upcoming } = await as(north.member, () => data(getDashboard));
		expect(upcoming.length).toBeGreaterThan(0);
		for (const order of upcoming) {
			const own = await units(order.number);
			expect(order.unitCount, order.number).toBe(own.length);
			expect(order.unit?.id ?? null, order.number).toBe(own[0]?.id ?? null);
		}

		// Another of its customer's units on an order with one: two, the first still first.
		const [other] = await rows<{ number: string; id: number }>(
			`select o.number, e.id from "order" o join equipment e on e.customer_id = o.customer_id
			 where o.organization_id = ? and o.number in (${upcoming.map(() => "?").join(", ")})
			  and (select count(*) from order_unit where order_id = o.id) = 1
			  and e.id not in (select equipment_id from order_unit where order_id = o.id)
			 order by o.number, e.id limit 1`,
			[northId, ...upcoming.map((order) => order.number)],
		);
		expect(other).toBeDefined();
		const [first] = await units(other.number);
		const form = await editForm(north.member, other.number);
		await as(north.member, () =>
			submit(updateOrder, { ...form, equipmentIds: [...form.equipmentIds, String(other.id)] }),
		);
		const after = (await as(north.member, () => data(getDashboard))).upcoming.find(
			(order) => order.number === other.number,
		);
		expect(after).toMatchObject({ unitCount: 2, unit: { id: first.id } });
	});
});

describe("South's dashboard", () => {
	test("has South's own numbers only", async () => {
		const charts = await expectChartsOf(south.owner, southId);
		const northCharts = await as(north.member, () => data(getCharts));
		expect(charts.equipmentByStatus).not.toEqual(northCharts.equipmentByStatus);
		const { made } = await as(south.owner, () => data(getDashboard));
		expect(made.week).toBe(await madeBetween(southId, 7, 0));
	});
});
