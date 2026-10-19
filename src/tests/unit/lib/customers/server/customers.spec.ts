/**
 * The customers' remote functions on the seeded demo database: the list is the tenant's customers
 * by name with their open orders, a customer's page has their revenue and latest orders priced as
 * the orders' own pages are (less what contracts include), one with equipment or orders can't be
 * deleted, customers made at once get consecutive codes, and South gets its own customers only,
 * also by North's codes and ids. The server side of `src/tests/e2e/customers.test.ts`, which keeps
 * the pages and forms, North's customer a 404 and the tampered edit form.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	createCustomer,
	deleteCustomer,
	getCustomer,
	getCustomerRevenue,
	getCustomers,
	updateCustomer,
} from "#lib/customers/customers.remote.ts";
import { getCustomerActivity } from "#lib/customers/detail/activity.remote.ts";
import { isDoneOrder } from "#lib/models.ts";
import { getOrder, updateOrder } from "#lib/orders/order.remote.ts";
import { batchQueryTests } from "#unit/lib/server/batch-query.test-support.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { editForm } from "../../orders/server/order-form.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

const customer = (id: number) => rows(`select * from customer where id = ?`, [id]);
const customerId = (code: string, organization: string) =>
	value<number>(`select id from customer where code = ? and organization_id = ?`, [
		code,
		organization,
	]);

/** The edit form of a customer as the page fills it, with `changes`. */
async function customerForm(id: number, changes: Record<string, unknown> = {}) {
	const [found] = await customer(id);
	return {
		id: String(id),
		name: found.name,
		segment: found.segment,
		contactName: found.contact_name,
		email: found.email,
		phone: found.phone,
		city: found.city,
		country: found.country,
		...changes,
	};
}

/** The code of North's customer with the most orders (and some equipment). */
const busyCustomer = () =>
	value<string>(
		`select c.code from customer c where c.organization_id = ?
		 and exists (select 1 from equipment e where e.customer_id = c.id)
		 order by (select count(*) from "order" o where o.customer_id = c.id) desc, c.id limit 1`,
		[northId],
	);

/** A code that exists in North only (North has more customers than South). */
const northOnly = () =>
	value<string>(
		`select code from customer where organization_id = ? and code not in
		 (select code from customer where organization_id = ?) order by code limit 1`,
		[northId, southId],
	);

describe("North's customers", () => {
	test("are listed by name, each with their units and open orders", async () => {
		const expected = await rows<{ code: string; units: number; open: number }>(
			`select c.code, (select count(*) from equipment e where e.customer_id = c.id) as units,
			 (select count(*) from "order" o where o.customer_id = c.id
			  and o.status in ('quote', 'scheduled', 'in_progress')) as open
			 from customer c where c.organization_id = ? order by c.name`,
			[northId],
		);
		const listed = await as(north.member, () => data(getCustomers));
		// By name, as the database sorts them (the table sorts them again in the user's language).
		expect(listed.map((row) => [row.code, row.equipmentCount, row.openOrders])).toEqual(
			expected.map((row) => [row.code, row.units, row.open]),
		);
	});

	test("one with equipment and orders can't be deleted, saying how many", async () => {
		const code = await busyCustomer();
		const id = await customerId(code, northId);
		const units = await value<number>(`select count(*) from equipment where customer_id = ?`, [id]);
		const orders = await value<number>(`select count(*) from "order" where customer_id = ?`, [id]);
		const answer = await as(north.member, () => submit(deleteCustomer, { id: String(id) }));
		expect(answer.status).toBe(400);
		const [refusal] = answer.issues!.map((issue) => issue.message);
		expect(refusal).toContain(`${units} equipment unit`);
		expect(refusal).toContain(`${orders} order`);
		expect(await customerId(code, northId)).toBe(id);
	});

	test("a customer's revenue and latest orders cost what the orders' own pages say", async () => {
		// A customer with a done order that a premium contract includes among their latest ten.
		const [covered] = await rows<{ code: string }>(
			`select c.code from customer c join "order" o on o.customer_id = c.id
			 join order_unit ou on ou.order_id = o.id and ou.position = 0
			 join contract_equipment ce on ce.equipment_id = ou.equipment_id
			 join contract k on k.id = ce.contract_id and k.level = 'premium'
			 where c.organization_id = ? and o.status in ('completed', 'invoiced') and o.labor_hours > 0
			 and o.id in (select r.id from "order" r where r.customer_id = c.id
			  order by r.created_at desc, r.id desc limit 10)
			 order by c.id limit 1`,
			[northId],
		);
		expect(covered).toBeDefined();
		await as(north.member, async () => {
			const numbers = await rows<{ number: string }>(
				`select number from "order" where customer_id = (select id from customer where code = ?
				 and organization_id = ?)`,
				[covered.code, northId],
			);
			const totals = new Map<string, { total: number; status: string }>();
			for (const { number } of numbers) {
				const { order, totals: priced } = await data(getOrder, number);
				totals.set(number, { total: priced.total, status: order.status });
			}
			const done = [...totals.values()].filter((order) => isDoneOrder(order.status as never));
			const stats = await data(getCustomerRevenue, covered.code);
			expect(stats.revenue).toBe(done.reduce((sum, order) => sum + order.total, 0));
			expect(stats.revenueOrders).toBe(done.length);

			const { orders, total } = await data(getCustomerActivity, covered.code);
			expect(total).toBe(numbers.length);
			expect(orders.some((order) => isDoneOrder(order.status) && order.total === 0)).toBe(true);
			for (const order of orders)
				expect(order.total, order.number).toBe(totals.get(order.number)!.total);
		});
	});

	test("an order completed today is in the customer's latest orders at once", async () => {
		const [open] = await rows<{ number: string; code: string }>(
			`with recent as (
				select o.*, row_number() over (
					partition by o.customer_id order by o.created_at desc, o.id desc
				) as position from "order" o where o.organization_id = ?
			)
			select r.number, c.code from recent r join customer c on c.id = r.customer_id
			where r.position <= 10 and r.status in ('scheduled', 'in_progress') order by r.id limit 1`,
			[northId],
		);
		await as(north.member, async () =>
			submit(updateOrder, await editForm(north.member, open.number, { status: "completed" })),
		);
		const { orders } = await as(north.member, () => data(getCustomerActivity, open.code));
		const listed = orders.find((order) => order.number === open.number);
		expect(listed?.status).toBe("completed");
		expect(
			listed?.completedAt
				?.toZonedDateTimeISO("Europe/Amsterdam")
				.toPlainDate()
				.equals(Temporal.Now.plainDateISO("Europe/Amsterdam")),
		).toBe(true);
	});

	test("customers made at the same moment get consecutive codes", async () => {
		const last = await value<string>(
			`select code from customer where organization_id = ?
			 order by cast(substr(code, 6) as integer) desc limit 1`,
			[northId],
		);
		const fields = (i: number) => ({
			name: `Simultaneous BV ${i}`,
			segment: "small_business",
			contactName: "Sam Jansen",
			email: "sam@simultaneous.example",
			phone: "+31 38 123 4567",
			city: "Zwolle",
			country: "Netherlands",
			address: "Dokterspad 1",
			postalCode: "8011 VZ",
		});
		const answers = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				as(north.member, () => submit(createCustomer, fields(i + 1))),
			),
		);
		expect(answers.map((answer) => answer.status)).toEqual(Array(8).fill(303));
		const stored = await rows<{ code: string }>(
			`select code from customer where organization_id = ? and name like 'Simultaneous BV %'
			 order by code`,
			[northId],
		);
		const start = Number(last.slice(5)) + 1;
		expect(stored.map((row) => row.code)).toEqual(
			Array.from({ length: 8 }, (_, i) => `CUST-${String(start + i).padStart(4, "0")}`),
		);
	});
});

describe("South's customers", () => {
	test("are South's only, also by a code only North has", async () => {
		const listed = await as(south.owner, () => data(getCustomers));
		expect(listed.map((row) => row.code).toSorted()).toEqual(
			(
				await rows<{ code: string }>(`select code from customer where organization_id = ?`, [
					southId,
				])
			)
				.map((row) => row.code)
				.toSorted(),
		);
		const only = await northOnly();
		await as(south.owner, async () => {
			expect(await call(getCustomer, only)).toMatchObject({ status: 404 });
			expect(await call(getCustomerActivity, only)).toMatchObject({ status: 404 });
		});
	});

	test("a code both have is South's customer, with South's orders", async () => {
		const own = await customerId("CUST-0001", southId);
		const [stored] = await customer(own);
		const latest = await rows<{ number: string }>(
			`select number from "order" where customer_id = ? order by created_at desc, id desc limit 10`,
			[own],
		);
		await as(south.owner, async () => {
			expect((await data(getCustomer, "CUST-0001")).customer).toMatchObject({
				id: own,
				name: stored.name,
			});
			expect((await data(getCustomerActivity, "CUST-0001")).orders.map((o) => o.number)).toEqual(
				latest.map((row) => row.number),
			);
		});
	});

	test("North's customers can't be changed or deleted by their ids", async () => {
		const target = await customerId(await northOnly(), northId);
		const own = await customerId("CUST-0001", southId);
		const [targetBefore, ownBefore] = [await customer(target), await customer(own)];
		const tampered = await customerForm(own, { id: String(target), city: "Tampered" });
		await as(south.owner, async () => {
			expect(await submit(updateCustomer, tampered)).toMatchObject({ status: 404 });
			expect(await submit(deleteCustomer, { id: String(target) })).toMatchObject({ status: 404 });
		});
		expect(await customer(target)).toEqual(targetBefore);
		expect(await customer(own)).toEqual(ownBefore);
	});
});

describe("getCustomer, the customer's page's and hover card's batch query", () => {
	batchQueryTests({
		query: getCustomer,
		table: "customer",
		column: "code",
		keyOf: (answer) => answer.customer.code,
	});

	test("it counts the customer's orders, open ones and when the last was made", async () => {
		const [busiest] = await rows<{ code: string; orders: number; open: number; last: number }>(
			`select c.code, count(*) as orders,
			 sum(o.status in ('quote', 'scheduled', 'in_progress')) as open, max(o.created_at) as last
			 from customer c join "order" o on o.customer_id = c.id
			 where c.organization_id = ? group by c.id order by orders desc limit 1`,
			[organizationId("north")],
		);
		const { stats } = await as(north.member, () => data(getCustomer, busiest.code));
		expect(stats).toMatchObject({ orders: busiest.orders, openOrders: busiest.open });
		expect(stats.lastOrderAt?.epochMilliseconds).toBe(busiest.last * 1000);
	});
});
