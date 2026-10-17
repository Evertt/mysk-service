/**
 * South can't see or change North's orders, also with North's ids in its requests: the orders'
 * remote functions as South on the seeded demo database (the server side of
 * `src/tests/e2e/orders.tenancy.test.ts`, which keeps the page's 404 and one tampered form).
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getCustomerOptions } from "#lib/components/data-table/filter-options.remote.ts";
import { getTimeZone } from "#lib/dates.ts";
import { bulkSetOrderStatus } from "#lib/orders/list/order-bulk.remote.ts";
import { getOrders } from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import { deleteOrder, getOrder, updateOrder } from "#lib/orders/order.remote.ts";
import {
	as,
	call,
	data,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The first page of the orders list, as South's table asks for it, filtered by `filters`. */
const ordersQuery = (filters: Record<string, unknown[]> = {}) =>
	({
		q: "",
		filters,
		sort: [{ id: "createdAt", desc: true }],
		group: null,
		pageIndex: 0,
		pageSize: ordersList.pageSize,
	}) as Parameters<typeof getOrders>[0];

/** An order, its units and its lines as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select o.*, (select group_concat(material_id || 'x' || quantity || '@' || unit_price)
		 from order_line where order_id = o.id) as lines,
		 (select group_concat(equipment_id || '@' || position) from order_unit where order_id = o.id)
		 as units from "order" o where id = ?`,
		[id],
	);

const orderId = (number: string, organization: string) =>
	value<number>(`select id from "order" where number = ? and organization_id = ?`, [
		number,
		organization,
	]);

/**
 * The edit form of South's order `number` as the browser submits it: its fields as the page
 * fills them (from `getOrder()`), with its material lines, and `changes` over them.
 */
async function editForm(number: string, changes: Record<string, unknown> = {}) {
	const { order } = await as(south.owner, () => data(getOrder, number));
	const scheduled = order.scheduledFor?.toZonedDateTimeISO(getTimeZone());
	const lines = await rows<{ material_id: number; quantity: number }>(
		`select material_id, quantity from order_line where order_id = ? order by id`,
		[order.id],
	);
	return {
		id: String(order.id),
		customerId: String(order.customerId),
		equipmentIds: order.units.map((unit) => String(unit.id)),
		engineerId: order.engineerId ? String(order.engineerId) : "",
		type: order.type,
		status: order.status,
		priority: order.priority,
		description: order.description,
		scheduledFor: scheduled ? scheduled.toPlainDate().toString() : "",
		scheduledTime: scheduled ? scheduled.toPlainTime().toString({ smallestUnit: "minute" }) : "",
		laborHours: order.laborHours,
		modules: {
			materials: {
				lines: lines.map((line) => ({
					materialId: String(line.material_id),
					quantity: line.quantity,
				})),
			},
		},
		...changes,
	};
}

/** A number of North's that South hasn't, and one both have. */
let northOnly: string;
let shared: string;

beforeAll(async () => {
	northOnly = await value<string>(
		`select number from "order" o where organization_id = ? and status = 'scheduled'
		 and not exists (select 1 from "order" s where s.organization_id = ? and s.number = o.number)
		 order by id desc limit 1`,
		[northId, southId],
	);
	// One South can edit (not completed or invoiced), with material lines.
	shared = await value<string>(
		`select o.number from "order" o where o.organization_id = ? and o.status in ('quote', 'scheduled')
		 and exists (select 1 from "order" n where n.organization_id = ? and n.number = o.number)
		 and exists (select 1 from order_line l where l.order_id = o.id)
		 order by o.id limit 1`,
		[southId, northId],
	);
});

describe("South's orders list", () => {
	test("never shows North's orders, whatever its filters say", async () => {
		// A customer code only North has, and one both have.
		const northCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code not in (select code from customer where organization_id = ?) order by code limit 1`,
			[northId, southId],
		);
		const sharedCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code in (select code from customer where organization_id = ?) order by code limit 1`,
			[southId, northId],
		);
		const northEngineer = await value<number>(
			`select engineer_id from "order" where organization_id = ? and engineer_id is not null limit 1`,
			[northId],
		);
		await as(south.owner, async () => {
			expect((await data(getOrders, ordersQuery({ customer: [northCode] }))).rowCount).toBe(0);
			expect((await data(getOrders, ordersQuery({ engineer: [northEngineer] }))).rowCount).toBe(0);
			const search = { ...ordersQuery(), q: northOnly };
			expect((await data(getOrders, search)).rowCount).toBe(0);

			const expected = await rows<{ number: string }>(
				`select o.number from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ? order by o.created_at desc, o.id`,
				[southId, sharedCode],
			);
			expect(expected.length).toBeGreaterThan(0);
			const shown = await data(getOrders, ordersQuery({ customer: [sharedCode] }));
			expect(shown.rowCount).toBe(expected.length);
			expect(shown.rows.map((row) => row.number)).toEqual(
				expected.slice(0, 50).map((row) => row.number),
			);
		});
	});

	test("shows all of South's orders, unfiltered", async () => {
		const answer = await as(south.owner, () => data(getOrders, ordersQuery()));
		expect(answer.rowCount).toBe(
			Number(await value(`select count(*) from "order" where organization_id = ?`, [southId])),
		);
	});

	test("its customer filter offers South's customers only", async () => {
		const own = new Set(
			(
				await rows<{ code: string }>(`select code from customer where organization_id = ?`, [
					southId,
				])
			).map((row) => row.code),
		);
		const northOnlyName = await value<string>(
			`select name from customer where organization_id = ?
			 and name not in (select name from customer where organization_id = ?) order by id limit 1`,
			[northId, southId],
		);
		await as(south.owner, async () => {
			const found = await data(getCustomerOptions, { search: "CUST", selected: [] });
			expect(found.options).toHaveLength(Math.min(own.size, 20));
			for (const option of found.options) expect(own.has(option.value), option.label).toBe(true);
			expect(
				(await data(getCustomerOptions, { search: northOnlyName, selected: [] })).options,
			).toEqual([]);
			// Nor by a code only North has, ticked (codes are numbered per tenant).
			const northCode = await value<string>(
				`select code from customer where organization_id = ?
				 and code not in (select code from customer where organization_id = ?) limit 1`,
				[northId, southId],
			);
			expect(
				(await data(getCustomerOptions, { search: "", selected: [northCode] })).selected,
			).toEqual([]);
		});
	});
});

describe("an order", () => {
	test("of North's is a 404 for South", async () => {
		expect(
			await value(
				`select group_concat(organization_id) from "order"
				 where number = ? and organization_id in (?, ?)`,
				[northOnly, northId, southId],
			),
		).toBe(northId);
		expect(await as(south.owner, () => call(getOrder, northOnly))).toMatchObject({ status: 404 });
	});

	test("with a number both have is South's own", async () => {
		const [own, other] = await rows<{ organization_id: string; name: string }>(
			`select o.organization_id, c.name from "order" o join customer c on c.id = o.customer_id
			 where o.number = ? and o.organization_id in (?, ?) order by o.organization_id = ? desc`,
			[shared, northId, southId, southId],
		);
		expect(own.organization_id).toBe(southId);
		const { order } = await as(south.owner, () => data(getOrder, shared));
		expect(order.organizationId).toBe(southId);
		expect(order.customer.name).toBe(own.name);
		expect(order.customer.name).not.toBe(other.name);
	});

	test("totals the same on its page and in the list: its materials and labour", async () => {
		const [stored] = await rows<{
			materials: number | null;
			labor_hours: number;
			hourly_rate: number | null;
		}>(
			`select o.labor_hours, e.hourly_rate, (select sum(round(l.quantity * l.unit_price))
			 from order_line l where l.order_id = o.id) as materials
			 from "order" o left join engineer e on e.id = o.engineer_id
			 where o.number = ? and o.organization_id = ?`,
			[shared, southId],
		);
		const total =
			(stored.materials ?? 0) + Math.round(stored.labor_hours * (stored.hourly_rate ?? 8500));
		await as(south.owner, async () => {
			const page = await data(getOrder, shared);
			// Unadjusted: South has invoices and materials, not contracts, which adjusts prices.
			expect(page.totals.total).toBe(total);
			const listed = await data(getOrders, { ...ordersQuery(), q: shared });
			expect(listed.rows.map((row) => [row.number, row.total])).toEqual([[shared, total]]);
		});
	});
});

describe("South's changes to North's orders", () => {
	test("saving the edit form with the id of a North order is refused", async () => {
		const victim = await orderId(northOnly, northId);
		const own = await orderId(shared, southId);
		const [victimBefore, ownBefore] = [await snapshot(victim), await snapshot(own)];
		const tampered = await editForm(shared, { id: String(victim) });
		expect(await as(south.owner, () => submit(updateOrder, tampered))).toMatchObject({
			status: 404,
		});
		expect(await snapshot(victim)).toEqual(victimBefore);
		expect(await snapshot(own)).toEqual(ownBefore);
	});

	test("North's customers and materials are refused, on their fields", async () => {
		const own = await orderId(shared, southId);
		const before = await snapshot(own);
		const customerId = String(
			await value(`select min(id) from customer where organization_id = ?`, [northId]),
		);
		const materialId = String(
			await value(`select min(id) from material where organization_id = ?`, [northId]),
		);
		const form = await editForm(shared);
		const withNorthMaterial = {
			materials: { lines: [...form.modules.materials.lines, { materialId, quantity: 1 }] },
		};

		const northCustomer = await as(south.owner, () =>
			submit(updateOrder, { ...form, customerId, modules: withNorthMaterial }),
		);
		// The order's own fields are checked first, the modules' parts once they're right.
		expect(northCustomer.status).toBe(400);
		expect(northCustomer.issues).toContainEqual({
			name: "customerId",
			path: ["customerId"],
			message: "Unknown customer",
		});
		// Nor are its units that customer's.
		expect(northCustomer.issues?.map((issue) => issue.name)).toEqual([
			"customerId",
			"equipmentIds",
		]);
		const northMaterial = await as(south.owner, () =>
			submit(updateOrder, { ...form, modules: withNorthMaterial }),
		);
		expect(northMaterial.status).toBe(400);
		expect(northMaterial.issues?.map((issue) => issue.message)).toContain("Unknown material");
		expect(await snapshot(own)).toEqual(before);
	});

	test("deleting with the id of a North order is refused", async () => {
		const victim = await orderId(northOnly, northId);
		const before = await snapshot(victim);
		expect(await as(south.owner, () => submit(deleteOrder, { id: String(victim) }))).toMatchObject({
			status: 404,
		});
		expect(await snapshot(victim)).toEqual(before);
	});

	test("a bulk action with the ids of North's orders finds none of them", async () => {
		const victims = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' order by id limit 2`,
			[northId],
		);
		const before = await Promise.all(victims.map((victim) => snapshot(victim.id)));
		const answer = await as(south.owner, () =>
			call(bulkSetOrderStatus, {
				target: { ids: victims.map((victim) => victim.id) },
				status: "cancelled",
			}),
		);
		expect(answer).toMatchObject({ status: 200, data: { done: 0, skipped: [], missing: 2 } });
		for (const [i, victim] of victims.entries()) {
			expect(await snapshot(victim.id)).toEqual(before[i]);
		}
	});

	test("the edit form itself saves, so the refusals above are the tenant's", async () => {
		const answer = await as(south.owner, async () =>
			submit(updateOrder, await editForm(shared, { description: "Edited by South" })),
		);
		expect(answer).toMatchObject({ status: 303, location: `/orders/${shared}` });
		expect(answer.refreshed).toContain("getOrder");
		expect(
			await value(`select description from "order" where id = ?`, [await orderId(shared, southId)]),
		).toBe("Edited by South");
	});
});
