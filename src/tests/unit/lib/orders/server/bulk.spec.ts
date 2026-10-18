/**
 * The orders list's bulk commands as North's planner sends them: changing the status skips an
 * invoiced order with the reason, deleting logs each order and puts back what it held in stock,
 * and assigning acts on exactly the target, the selected ids or all that match the filters,
 * nothing of another tenant's. The server side of `src/tests/e2e/orders.bulk.test.ts`, which keeps
 * the selection, the dialog and the refreshed rows.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	bulkAssignOrders,
	bulkDeleteOrders,
	bulkSetOrderStatus,
} from "#lib/orders/list/order-bulk.remote.ts";
import { as, call, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";

import { snapshot } from "./order-form.test-support.ts";

const northId = organizationId("north");

/** A customer of North's with an order in each of `statuses`, and those orders (one of each). */
async function ordersOfOneCustomer(...statuses: string[]) {
	const has = statuses
		.map(() => `exists (select 1 from "order" o where o.customer_id = c.id and o.status = ?)`)
		.join(" and ");
	const customer = await value<number>(
		`select c.id from customer c where c.organization_id = ? and ${has} order by c.id desc limit 1`,
		[northId, ...statuses],
	);
	return Promise.all(
		statuses.map(async (status) => {
			const [found] = await rows<{ id: number; number: string; engineer_id: number | null }>(
				`select id, number, engineer_id from "order" where customer_id = ? and status = ?
				 order by number limit 1`,
				[customer, status],
			);
			return found;
		}),
	);
}

/** The activity logged for an order, newest first. */
const activityOf = (id: number) =>
	rows<{ action: string; changes: string | null }>(
		`select action, changes from activity where organization_id = ? and subject_type = 'order'
		 and subject_id = ? order by id desc`,
		[northId, String(id)],
	);

/** North's materials whose stock isn't what their movements add up to. */
const unbalancedStock = () =>
	rows(
		`select sku from (select m.sku, m.stock, round(coalesce(sum(s.quantity), 0), 2) as movements
		 from material m left join stock_movement s on s.material_id = m.id
		 where m.organization_id = ? group by m.id) where round(stock, 2) <> movements`,
		[northId],
	);

describe("bulk actions on North's orders", () => {
	test("changing the status skips an invoiced order, and says why", async () => {
		const [invoiced, quote] = await ordersOfOneCustomer("invoiced", "quote");
		const before = await snapshot(invoiced.id);
		const answer = await as(north.member, () =>
			call(bulkSetOrderStatus, { target: { ids: [invoiced.id, quote.id] }, status: "cancelled" }),
		);
		expect(answer).toMatchObject({
			status: 200,
			data: {
				done: 1,
				missing: 0,
				skipped: [
					{
						label: invoiced.number,
						reason: expect.stringContaining(`${invoiced.number} is invoiced`),
					},
				],
			},
		});
		expect(await value(`select status from "order" where id = ?`, [quote.id])).toBe("cancelled");
		expect(await snapshot(invoiced.id)).toEqual(before);
		expect((await activityOf(quote.id))[0].action).toBe("updated");
		expect(await unbalancedStock()).toEqual([]);
	});

	test("changing the status skips an order that already has it, and says so", async () => {
		const [quote, scheduled] = await ordersOfOneCustomer("quote", "scheduled");
		const before = await snapshot(scheduled.id);
		const logged = await activityOf(scheduled.id);
		const answer = await as(north.member, () =>
			call(bulkSetOrderStatus, { target: { ids: [quote.id, scheduled.id] }, status: "scheduled" }),
		);
		expect(answer).toMatchObject({
			status: 200,
			data: {
				done: 1,
				missing: 0,
				skipped: [
					{
						label: scheduled.number,
						reason: expect.stringContaining(`${scheduled.number} is already scheduled`),
					},
				],
			},
		});
		expect(await value(`select status from "order" where id = ?`, [quote.id])).toBe("scheduled");
		expect(await snapshot(scheduled.id)).toEqual(before);
		expect(await activityOf(scheduled.id)).toEqual(logged);
	});

	test("deleting the selected orders deletes and logs each, and puts back their stock", async () => {
		// Scheduled orders with materials: they hold stock.
		const picked = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.organization_id = ? and o.status = 'scheduled'
			 and exists (select 1 from order_line l where l.order_id = o.id) order by o.id limit 2`,
			[northId],
		);
		expect(picked).toHaveLength(2);
		const answer = await as(north.member, () =>
			call(bulkDeleteOrders, { ids: picked.map((order) => order.id) }),
		);
		expect(answer).toMatchObject({ status: 200, data: { done: 2, skipped: [], missing: 0 } });
		for (const order of picked) {
			expect(await value(`select count(*) from "order" where id = ?`, [order.id])).toBe(0);
			expect((await activityOf(order.id))[0].action).toBe("deleted");
		}
		expect(await unbalancedStock()).toEqual([]);
	});

	/** Every order of every organization with its engineer. */
	const engineers = () =>
		rows<{ id: number; engineer_id: number | null }>(
			`select id, engineer_id from "order" order by id`,
		);
	const engineer = () =>
		value<number>(
			`select id from engineer where organization_id = ? and active = 1 order by id desc limit 1`,
			[northId],
		);

	test("assigning the selected orders an engineer changes those and logs it", async () => {
		const [quote, scheduled] = await ordersOfOneCustomer("quote", "scheduled");
		const id = await value<number>(
			`select id from engineer where organization_id = ? and active = 1 and id not in (?, ?)
			 order by id desc limit 1`,
			[northId, quote.engineer_id ?? 0, scheduled.engineer_id ?? 0],
		);
		const before = await engineers();
		const answer = await as(north.member, () =>
			call(bulkAssignOrders, { target: { ids: [quote.id, scheduled.id] }, engineerId: id }),
		);
		expect(answer).toMatchObject({ status: 200, data: { done: 2 } });
		const picked = new Map([quote, scheduled].map((order) => [order.id, order]));
		expect(await engineers()).toEqual(
			before.map((o) => (picked.has(o.id) ? { ...o, engineer_id: id } : o)),
		);
		for (const order of picked.values()) {
			const [latest] = await activityOf(order.id);
			expect(latest.action).toBe("updated");
			expect(JSON.parse(latest.changes!)).toEqual({ engineerId: [order.engineer_id, id] });
		}
	});

	test("assigning all that match the filters acts on exactly those, none of another tenant's", async () => {
		const cancelled = new Set(
			(
				await rows<{ id: number }>(
					`select id from "order" where organization_id = ? and status = 'cancelled'`,
					[northId],
				)
			).map((row) => row.id),
		);
		expect(cancelled.size).toBeGreaterThan(0);
		const id = await engineer();
		const before = await engineers();
		const answer = await as(north.member, () =>
			call(bulkAssignOrders, {
				target: { matching: { q: "", filters: { status: ["cancelled"] } } },
				engineerId: id,
			}),
		);
		expect(answer).toMatchObject({ status: 200, data: { skipped: [], missing: 0 } });
		expect(await engineers()).toEqual(
			before.map((o) => (cancelled.has(o.id) ? { ...o, engineer_id: id } : o)),
		);
	});

	test("an inactive engineer can't be assigned", async () => {
		const inactive = await value<number>(
			`select id from engineer where organization_id = ? and active = 0 limit 1`,
			[northId],
		);
		const [quote] = await ordersOfOneCustomer("quote");
		const before = await snapshot(quote.id);
		expect(
			await as(north.member, () =>
				call(bulkAssignOrders, { target: { ids: [quote.id] }, engineerId: inactive }),
			),
		).toMatchObject({ status: 400 });
		expect(await snapshot(quote.id)).toEqual(before);
	});
});
