/**
 * What contracts do to core's orders, on the seeded demo database: which contract covers an
 * order and its response deadline, the call-outs at risk or overdue and the contracts ending soon
 * on the dashboard, the SLA badges in the orders list, what a covered order costs (the same on its
 * page, in the list, in its unit's service history and its customer's recent activity, and in the
 * dashboard's revenue), the contracts covering a unit, and all of that gone with the module
 * switched off (the server side of `../../e2e/contracts.orders.test.ts`, which keeps the pages).
 * The rules themselves are `../coverage.spec.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getCustomerActivity } from "#lib/customers/detail/activity.remote.ts";
import { getServiceHistory } from "#lib/equipment/detail/service-history.remote.ts";
import { getOrders } from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import { getOrder } from "#lib/orders/order.remote.ts";
import {
	getContractsOverview,
	getOrderCoverage,
	getUnitCoverage,
} from "#modules/contracts/coverage.remote.ts";
import { getDashboard } from "#routes/(app)/(dashboard)/dashboard.remote.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const northId = organizationId("north");
const today = Temporal.Now.plainDateISO("Europe/Amsterdam").toString();

/** The first page of the orders list, searched for `q`. */
const searched = (q: string) =>
	({
		q,
		filters: {},
		sort: [{ id: "createdAt", desc: true }],
		group: null,
		pageIndex: 0,
		pageSize: ordersList.pageSize,
	}) as Parameters<typeof getOrders>[0];

const tagsOf = async (number: string) => {
	const { rows: found } = await data(getOrders, searched(number));
	return found.find((row) => row.number === number)!.tags.map((tag) => tag.label);
};

type Overview = Awaited<ReturnType<typeof getContractsOverview>>;
let overview: Overview;

beforeAll(async () => {
	overview = await as(north.member, () => data(getContractsOverview));
});

describe("North's call-outs on covered units", () => {
	test("the dashboard lists those at risk or overdue, most urgent first", async () => {
		const states = new Set(overview.responses.map((row) => row.response.state));
		// The seed has one of each.
		expect(states).toEqual(new Set(["overdue", "at_risk"]));
		const dues = overview.responses.map((row) => row.response.due.epochMilliseconds);
		expect(dues).toEqual(dues.toSorted((a, b) => a - b));
		for (const row of overview.responses) {
			expect(["breakdown", "repair"], row.number).toContain(row.type);
			expect(["awaiting_acceptance", "quote"], row.number).toContain(row.status);
			// Its deadline is the contract's response time after it was made.
			expect(
				row.response.due.equals(row.createdAt.add({ hours: row.contract.responseHours })),
			).toBe(true);
			// The contract covers all its units, on the day it was made.
			const uncovered = await rows(
				`select ou.equipment_id from order_unit ou join "order" o on o.id = ou.order_id
				 where o.number = ? and o.organization_id = ? and not exists (select 1 from contract_equipment ce
				 join contract k on k.id = ce.contract_id where k.number = ? and k.organization_id = ?
				 and ce.equipment_id = ou.equipment_id)`,
				[row.number, northId, row.contract.number, northId],
			);
			expect(uncovered, row.number).toEqual([]);
		}
	});

	test("each one's page shows the same contract and deadline", async () => {
		await as(north.member, async () => {
			for (const row of overview.responses) {
				const coverage = (await data(getOrderCoverage, row.number)).covered;
				expect(coverage, row.number).toMatchObject({
					contract: { number: row.contract.number, level: row.contract.level },
					response: { state: row.response.state },
				});
				expect(coverage!.response!.due.equals(row.response.due)).toBe(true);
			}
		});
	});

	test("the orders list and their pages badge them", async () => {
		const overdue = overview.responses.find((row) => row.response.state === "overdue")!;
		const atRisk = overview.responses.find((row) => row.response.state === "at_risk")!;
		await as(north.member, async () => {
			expect(await tagsOf(overdue.number)).toContain("SLA overdue");
			expect(await tagsOf(atRisk.number)).toContain("SLA at risk");
			expect((await data(getOrder, overdue.number)).tags.map((tag) => tag.label)).toContain(
				"SLA overdue",
			);
		});
	});

	test("the dashboard lists the contracts ending in 60 days that weren't renewed", async () => {
		const expected = await rows<{ number: string }>(
			`select number from contract k where organization_id = ? and starts_on <= ? and ends_on >= ?
			 and ends_on < date(?, '+60 days') and not exists (select 1 from contract later
			 where later.customer_id = k.customer_id and later.starts_on > k.ends_on)
			 order by ends_on, number`,
			[northId, today, today, today],
		);
		expect(expected.length).toBeGreaterThan(0);
		expect(overview.expiring.map((row) => row.number)).toEqual(expected.map((row) => row.number));
		expect(overview.days).toBe(60);
	});
});

describe("a premium-covered repair", () => {
	let order: { number: string; customer: string; serial: string };

	beforeAll(async () => {
		// With labour and materials, among its customer's ten latest orders (their page lists those).
		const candidates = await rows<{ number: string; customer: string; serial: string }>(
			`select o.number, c.code as customer, e.serial_number as serial from "order" o
			 join customer c on c.id = o.customer_id
			 join order_unit ou on ou.order_id = o.id and ou.position = 0 join equipment e on e.id = ou.equipment_id
			 where o.organization_id = ? and o.type = 'repair' and o.labor_hours > 0
			 and exists (select 1 from order_line l where l.order_id = o.id)
			 and o.id in (select r.id from "order" r where r.customer_id = o.customer_id
			 order by r.created_at desc, r.id desc limit 10) order by o.id`,
			[northId],
		);
		await as(north.member, async () => {
			for (const candidate of candidates) {
				const coverage = (await data(getOrderCoverage, candidate.number)).covered;
				if (coverage?.contract.level === "premium") {
					order = candidate;
					return;
				}
			}
		});
		expect(order).toBeDefined();
	});

	test("includes its labour and materials, as a line of its own", async () => {
		const { totals } = await as(north.member, () => data(getOrder, order.number));
		const costs = totals.costs.reduce((sum, cost) => sum + cost.amount, 0);
		expect(costs).toBeGreaterThan(0);
		expect(totals.adjustments).toHaveLength(1);
		const [included] = totals.adjustments;
		expect(included.label).toMatch(/^Covered by CTR-\d{4}-\d{4} \(Premium\)$/);
		expect(included.detail).toBe("Labour and materials included");
		expect(included.amount).toBe(-(costs + totals.labor));
		expect(totals.total).toBe(0);
	});

	test("costs the same in the list, its unit's service history and its customer's activity", async () => {
		await as(north.member, async () => {
			const { totals } = await data(getOrder, order.number);
			const listed = await data(getOrders, searched(order.number));
			expect(listed.rows.map((row) => [row.number, row.total])).toEqual([
				[order.number, totals.total],
			]);
			const { events } = await data(getServiceHistory, order.serial);
			const event = events.find(
				(each) => each.kind === "order" && each.order.number === order.number,
			);
			expect(event?.kind === "order" && event.order.cost).toMatchObject({
				total: totals.total,
				adjustments: totals.adjustments,
			});
			const activity = await data(getCustomerActivity, order.customer);
			expect(activity.orders.find((each) => each.number === order.number)?.total).toBe(
				totals.total,
			);
		});
	});

	test("with the module switched off, it's priced in full and nothing of it shows", async () => {
		const overdue = overview.responses.find((row) => row.response.state === "overdue")!;
		await withoutModule("north", "contracts", () =>
			as(north.member, async () => {
				const { totals } = await data(getOrder, order.number);
				expect(totals.adjustments).toEqual([]);
				const costs = totals.costs.reduce((sum, cost) => sum + cost.amount, 0);
				expect(totals.total).toBe(costs + totals.labor);
				expect(await tagsOf(overdue.number)).not.toContainEqual(expect.stringMatching(/^SLA/));
			}),
		);
	});
});

describe("the dashboard's revenue", () => {
	test("takes off what contracts include, priced like the orders' pages", async () => {
		const done = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status in ('completed', 'invoiced')
			 and completed_at >= unixepoch('now', '-30 days')`,
			[northId],
		);
		const sumOfPages = async () => {
			let total = 0;
			for (const { number } of done) total += (await data(getOrder, number)).totals.total;
			return total;
		};
		const covered = await as(north.member, async () => ({
			revenue: (await data(getDashboard)).revenue,
			pages: await sumOfPages(),
		}));
		expect(covered.revenue).toMatchObject({ total: covered.pages, orders: done.length });
		const full = await withoutModule("north", "contracts", () =>
			as(north.member, async () => (await data(getDashboard)).revenue.total),
		);
		expect(full).toBeGreaterThan(covered.revenue.total);
	});
});

describe("a covered unit", () => {
	test("lists the contracts covering it, latest first", async () => {
		const [unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and (select count(*) from contract_equipment ce where ce.equipment_id = e.id) > 1 order by e.id limit 1`,
			[northId],
		);
		const expected = await rows<{ number: string }>(
			`select k.number from contract_equipment ce join contract k on k.id = ce.contract_id
			 where ce.equipment_id = ? order by k.starts_on desc`,
			[unit.id],
		);
		const listed = await as(north.member, () => data(getUnitCoverage, unit.serial_number));
		expect(listed.map((row) => row.number)).toEqual(expected.map((row) => row.number));
	});
});
