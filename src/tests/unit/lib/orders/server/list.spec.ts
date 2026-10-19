/**
 * The orders list's queries on the seeded demo database, as North's planner's table asks for them:
 * what `getOrders` and `getOrderFacets` return for a search, filters and sorting, page by page,
 * against the test's own SQL; what the customer filter's search finds; and that SvelteKit applies
 * their schemas (the server side of `src/tests/e2e/orders.list.test.ts`).
 */
import { describe, expect, test } from "vite-plus/test";

import {
	getOrderCustomerOptions,
	getOrderEngineerOptions,
	getOrderEquipmentOptions,
	getOrderFacets,
	getOrders,
} from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	value,
} from "#unit/lib/server/harness/index.ts";

const northId = organizationId("north");

type Query = Parameters<typeof getOrders>[0];

/** A page of the list as the table asks for it: newest first, unless `changes` say otherwise. */
const ordersQuery = (changes: Partial<Query> = {}): Query => ({
	q: "",
	filters: {},
	sort: [{ id: "createdAt", desc: true }],
	group: null,
	pageIndex: 0,
	pageSize: ordersList.pageSize,
	...changes,
});

/** The rows' numbers and the count of the list as North's planner. */
const listed = async (changes: Partial<Query> = {}) => {
	const { rows: found, rowCount } = await as(north.member, () =>
		data(getOrders, ordersQuery(changes)),
	);
	return { numbers: found.map((row) => row.number), rowCount };
};

const count = async (sql: string, args: (string | number)[] = []) => Number(await value(sql, args));

/** What the search finds an order `o` by of its units, any of them (four parameters). */
const anyUnitLike = `exists (select 1 from order_unit x join equipment u on u.id = x.equipment_id
	where x.order_id = o.id and (u.manufacturer like ? or u.model like ? or u.serial_number like ?
	or u.name like ?))`;

describe("North's orders list", () => {
	test("pages through all of North's orders, newest first, a page at a time", async () => {
		const numbers = (
			await rows<{ number: string }>(
				`select number from "order" where organization_id = ? order by created_at desc, id limit 100`,
				[northId],
			)
		).map((row) => row.number);
		const first = await listed();
		expect(first.rowCount).toBe(
			await count(`select count(*) from "order" where organization_id = ?`, [northId]),
		);
		expect(first.numbers).toEqual(numbers.slice(0, 50));
		expect((await listed({ pageIndex: 1 })).numbers).toEqual(numbers.slice(50));
	});

	test("filters by customer and status, sorted by urgency and number", async () => {
		// The customer with the most open orders.
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.code limit 1`,
			[northId],
		);
		const open = await rows<{ number: string; priority: string }>(
			`select o.number, o.priority from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ? and o.status in ('quote', 'scheduled', 'in_progress')`,
			[northId, code],
		);
		expect(open.length).toBeGreaterThan(0);
		const urgency = ["low", "normal", "high", "urgent"];
		const expected = open
			.toSorted(
				(a, b) =>
					urgency.indexOf(b.priority) - urgency.indexOf(a.priority) ||
					a.number.localeCompare(b.number),
			)
			.map((row) => row.number);
		const status = ["quote", "scheduled", "in_progress"] as const;
		const sort = [
			{ id: "priority", desc: true },
			{ id: "number", desc: false },
		] as Query["sort"];
		const filtered = await listed({ filters: { customer: [code], status: [...status] }, sort });
		expect(filtered).toEqual({ numbers: expected.slice(0, 50), rowCount: open.length });
		// Without the customer: all the open orders.
		expect((await listed({ filters: { status: [...status] }, sort })).rowCount).toBe(
			await count(
				`select count(*) from "order" where organization_id = ? and status in ('quote', 'scheduled', 'in_progress')`,
				[northId],
			),
		);
	});

	test("searches, filters and sorts in the database, and counts the statuses of what it finds", async () => {
		// A word of the name of the customer with the most scheduled or running orders.
		const [{ word }] = await rows<{ word: string }>(
			`select substr(c.name, 1, instr(c.name || ' ', ' ') - 1) as word
			 from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.id limit 1`,
			[northId],
		);
		const like = `%${word}%`;
		const matches = `(o.number like ? or c.name like ? or c.code like ? or ${anyUnitLike} or e.name like ?)`;
		const expected = await rows<{ number: string }>(
			`select o.number from "order" o join customer c on c.id = o.customer_id
			 left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress') and ${matches}
			 order by case o.priority when 'low' then 0 when 'normal' then 1 when 'high' then 2 else 3 end desc,
			   o.scheduled_for is null, o.scheduled_for, o.id`,
			[northId, ...Array(8).fill(like)],
		);
		expect(expected.length).toBeGreaterThan(0);
		const sort = [
			{ id: "priority", desc: true },
			{ id: "scheduledFor", desc: false },
		] as Query["sort"];
		const found = await listed({
			q: word,
			filters: { status: ["scheduled", "in_progress"] },
			sort,
		});
		expect(found).toEqual({
			numbers: expected.slice(0, 50).map((row) => row.number),
			rowCount: expected.length,
		});

		// The status filter counts what the search and the other filters leave.
		const counts = await rows<{ status: string; n: number }>(
			`select o.status, count(*) as n from "order" o join customer c on c.id = o.customer_id
			 left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and ${matches} group by o.status`,
			[northId, ...Array(8).fill(like)],
		);
		const facets = await as(north.member, () =>
			data(getOrderFacets, { q: word, filters: { status: ["scheduled", "in_progress"] } }),
		);
		expect(facets.status).toEqual(Object.fromEntries(counts.map(({ status, n }) => [status, n])));
	});

	test("sorts by the first unit as the column shows it: its name, or its manufacturer and model", async () => {
		// The first unit that sorts last by its manufacturer gets a name of its own (the seed's have
		// none) that sorts it among the first.
		const [last] = await rows<{ id: number; number: string }>(
			`select u.id, o.number from "order" o
			 join order_unit ou on ou.order_id = o.id and ou.position = 0
			 join equipment u on u.id = ou.equipment_id
			 where o.organization_id = ?
			 order by u.manufacturer collate nocase desc, u.model collate nocase desc, o.id desc limit 1`,
			[northId],
		);
		await rows(`update equipment set name = 'Achterdeur' where id = ?`, [last.id]);
		const expected = await rows<{ number: string }>(
			`select o.number from "order" o
			 left join order_unit ou on ou.order_id = o.id and ou.position = 0
			 left join equipment u on u.id = ou.equipment_id
			 where o.organization_id = ?
			 order by coalesce(u.name, u.manufacturer) collate nocase asc nulls last,
			   u.model collate nocase asc nulls last, o.id
			 limit 50`,
			[northId],
		);
		expect(expected.map((row) => row.number)).toContain(last.number);
		const found = await listed({ sort: [{ id: "equipment", desc: false }] });
		expect(found.numbers).toEqual(expected.map((row) => row.number));
	});

	test("the customer filter finds North's customers by name or code, at most 20, most orders first", async () => {
		// The customer with the most orders with one engineer, as the e2e test picks it.
		const [busy] = await rows<{ code: string; name: string }>(
			`select c.code, c.name from "order" o
			 join customer c on c.id = o.customer_id join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by c.id, e.id order by count(*) desc, c.id, e.id limit 1`,
			[northId],
		);
		// Three letters of their name, inside a word (the search takes words, and a space ends one).
		const fragment = busy.name.slice(1, 4).toLowerCase();
		expect(fragment).toMatch(/^\S+$/);
		const like = `%${fragment}%`;
		const matching = await rows<{ code: string; name: string; orders: number }>(
			`select c.code, c.name, (select count(*) from "order" o where o.customer_id = c.id) as orders
			 from customer c where c.organization_id = ? and (c.name like ? or c.code like ?)
			 order by orders desc, c.name collate nocase, c.id limit 20`,
			[northId, like, like],
		);
		const found = await as(north.member, () =>
			data(getOrderCustomerOptions, {
				where: { q: "", filters: {} },
				search: fragment,
				selected: [busy.code],
			}),
		);
		expect(found.options).toEqual(
			matching.map((row) => ({ value: row.code, label: row.name, count: row.orders })),
		);
		const orders = matching.find((row) => row.code === busy.code)?.orders;
		expect(found.selected).toEqual([{ value: busy.code, label: busy.name, count: orders }]);
	});

	test("the customer filter's counts are under the search and the other filters, not its own", async () => {
		const where = { q: "", filters: { status: ["completed" as const] } };
		const options = (filters: Query["filters"], search = "") =>
			as(north.member, () =>
				data(getOrderCustomerOptions, { where: { ...where, filters }, search, selected: [] }),
			);
		const completed = await rows<{ code: string; n: number }>(
			`select c.code, count(o.id) as n from customer c
			 left join "order" o on o.customer_id = c.id and o.status = 'completed'
			 where c.organization_id = ? group by c.id order by n desc, c.name collate nocase, c.id`,
			[northId],
		);
		const found = await options({ status: ["completed"] });
		expect(found.options.map((option) => [option.value, option.count])).toEqual(
			completed.slice(0, 20).map((row) => [row.code, row.n]),
		);
		expect(found.more).toBe(completed.length > 20);
		// Ticking a customer doesn't change its own filter's counts.
		const ticked = await options({ status: ["completed"], customer: [completed[1].code] });
		expect(ticked.options).toEqual(found.options);
		// A customer without completed orders is still offered, with 0, after those with some.
		const idle = completed.find((row) => row.n === 0);
		expect(idle).toBeDefined();
		const named = await value<string>(
			`select name from customer where code = ? and organization_id = ?`,
			[idle!.code, northId],
		);
		const searched = await options({ status: ["completed"] }, named);
		expect(searched.options).toContainEqual(
			expect.objectContaining({ value: idle!.code, count: 0 }),
		);
		const counts = searched.options.map((option) => option.count ?? 0);
		expect(counts).toEqual(counts.toSorted((a, b) => b - a));
	});

	test("the engineer and unit filters count orders under the other filters", async () => {
		const [busy] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? group by c.id order by count(*) desc, c.id limit 1`,
			[northId],
		);
		const where = { q: "", filters: { customer: [busy.code] } };
		const engineers = await as(north.member, () =>
			data(getOrderEngineerOptions, { where, search: "", selected: [] }),
		);
		const expected = await rows<{ id: number; n: number }>(
			`select e.id, count(o.id) as n from engineer e
			 left join "order" o on o.engineer_id = e.id
			   and o.customer_id = (select id from customer where code = ? and organization_id = ?)
			 where e.organization_id = ? group by e.id order by n desc, e.name collate nocase, e.id limit 20`,
			[busy.code, northId, northId],
		);
		expect(engineers.options.map((option) => [option.value, option.count])).toEqual(
			expected.map((row) => [String(row.id), row.n]),
		);
		expect(engineers.none).toBe(
			await count(
				`select count(*) from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ? and o.engineer_id is null`,
				[northId, busy.code],
			),
		);
		// An order counts for each of its units.
		const units = await as(north.member, () =>
			data(getOrderEquipmentOptions, { where, search: "", selected: [] }),
		);
		const [top] = await rows<{ serial: string; n: number }>(
			`select u.serial_number as serial, count(distinct o.id) as n from "order" o
			 join customer c on c.id = o.customer_id join order_unit x on x.order_id = o.id
			 join equipment u on u.id = x.equipment_id
			 where o.organization_id = ? and c.code = ? group by u.id order by n desc limit 1`,
			[northId, busy.code],
		);
		expect(units.options[0]).toMatchObject({ count: top.n, detail: expect.any(String) });
		expect(units.options.find((option) => option.value === top.serial)?.count).toBe(top.n);
	});

	test("filters by customer and engineer", async () => {
		// The customer and engineer with the most orders together.
		const [busy] = await rows<{ code: string; engineer: number }>(
			`select c.code, e.id as engineer from "order" o
			 join customer c on c.id = o.customer_id join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by c.id, e.id order by count(*) desc, c.id, e.id limit 1`,
			[northId],
		);
		const ofCustomer = `select count(*) from "order" o join customer c on c.id = o.customer_id
			where o.organization_id = ? and c.code = ?`;
		expect((await listed({ filters: { customer: [busy.code] } })).rowCount).toBe(
			await count(ofCustomer, [northId, busy.code]),
		);
		const both = await as(north.member, () =>
			data(
				getOrders,
				ordersQuery({ filters: { customer: [busy.code], engineer: [busy.engineer] } }),
			),
		);
		expect(both.rowCount).toBe(
			await count(`${ofCustomer} and o.engineer_id = ?`, [northId, busy.code, busy.engineer]),
		);
		expect(new Set(both.rows.map((row) => row.engineer?.id))).toEqual(new Set([busy.engineer]));
	});

	test("the unassigned orders and the new installations are `none`, in the filter and its counts", async () => {
		const unassigned = await count(
			`select count(*) from "order" where organization_id = ? and engineer_id is null`,
			[northId],
		);
		expect(unassigned).toBeGreaterThan(0);
		const nobody = await as(north.member, () =>
			data(getOrders, ordersQuery({ filters: { engineer: [null] } })),
		);
		expect(nobody.rowCount).toBe(unassigned);
		expect(new Set(nobody.rows.map((row) => row.engineer?.id ?? null))).toEqual(new Set([null]));
		const engineers = await as(north.member, () =>
			data(getOrderEngineerOptions, { where: { q: "", filters: {} }, search: "", selected: [] }),
		);
		expect(engineers.none).toBe(unassigned);

		// With an engineer: theirs and the unassigned ones.
		const [busy] = await rows<{ id: number; n: number }>(
			`select e.id, count(*) as n from "order" o join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by e.id order by n desc, e.id limit 1`,
			[northId],
		);
		expect((await listed({ filters: { engineer: [null, busy.id] } })).rowCount).toBe(
			unassigned + busy.n,
		);

		// The equipment filter likewise keeps the orders without a unit: the new installations.
		const installations = await count(
			`select count(*) from "order" o where organization_id = ?
			 and not exists (select 1 from order_unit x where x.order_id = o.id)`,
			[northId],
		);
		expect(installations).toBeGreaterThan(0);
		const without = await as(north.member, () =>
			data(getOrders, ordersQuery({ filters: { equipment: [null] } })),
		);
		expect(without.rowCount).toBe(installations);
		expect(new Set(without.rows.map((row) => row.unitCount))).toEqual(new Set([0]));
		const units = await as(north.member, () =>
			data(getOrderEquipmentOptions, { where: { q: "", filters: {} }, search: "", selected: [] }),
		);
		expect(units.none).toBe(installations);
	});
});

describe("a malformed query is refused with a 400, as SvelteKit applies the schemas", () => {
	// An unknown status, a filter the list doesn't have, a string for an id, a page size it doesn't
	// have.
	test.each<Record<string, unknown>>([
		{ filters: { status: ["bogus"] } },
		{ filters: { total: [1] } },
		{ filters: { engineer: ["1"] } },
		{ pageSize: 5000 },
	])("in the rows' query: %j", async (change) => {
		const answer = await as(north.member, () =>
			call(getOrders, { ...ordersQuery(), ...change } as Query),
		);
		expect(answer).toMatchObject({ status: 400, message: "Bad Request" });
	});

	test("in the filters' counts", async () => {
		const answer = await as(north.member, () =>
			call(getOrderFacets, { q: "ORD", filters: { status: ["bogus"] } } as never),
		);
		expect(answer).toMatchObject({ status: 400 });
	});
});
