/**
 * What the orders' remote functions refuse when one of North's orders is changed: an invoiced
 * order, by the form, the list's status cell or a tampered id; a status that can't be given by
 * hand; another tenant's order; a type the tenant hides; units of another customer or tenant. The
 * server side of `orders.test.ts`, `orders.inline.test.ts`, `orders.types.test.ts` and
 * `orders.units.test.ts`, which keep the pages and the forms.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { setOrderStatus } from "#lib/orders/list/order-status.remote.ts";
import { createOrder, deleteOrder, updateOrder } from "#lib/orders/order.remote.ts";
import { saveOrderType } from "#lib/orders/type-settings/type-settings.remote.ts";
import { demoUsers } from "#lib/server/db/demo.ts";
import {
	as,
	call,
	north,
	organizationId,
	rows,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { editForm, orderId, snapshot } from "./order-form.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The last of an organization's orders with `status`, by number. */
const orderWith = async (organization: string, status: string) =>
	(
		await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? and status = ?
			 order by number desc limit 1`,
			[organization, status],
		)
	)[0];

/** The activity logged for an order, newest first. */
const activityOf = (id: number) =>
	rows<{ action: string; changes: string | null; user_name: string }>(
		`select action, changes, user_name from activity where organization_id = ?
		 and subject_type = 'order' and subject_id = ? order by id desc`,
		[northId, String(id)],
	);

let invoiced: { id: number; number: string };
let completed: { id: number; number: string };

beforeAll(async () => {
	invoiced = await orderWith(northId, "invoiced");
	completed = await orderWith(northId, "completed");
});

describe("an invoiced order", () => {
	test("can't be saved, also by another order's form with its id", async () => {
		const before = [await snapshot(invoiced.id), await snapshot(completed.id)];
		const form = await editForm(north.member, completed.number, {
			id: String(invoiced.id),
			laborHours: 99,
		});
		const answer = await as(north.member, () => submit(updateOrder, form));
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toContainEqual(
			expect.stringMatching(`${invoiced.number} is invoiced.*can't be changed`),
		);
		expect([await snapshot(invoiced.id), await snapshot(completed.id)]).toEqual(before);
	});

	test("can't be deleted, also by another order's form with its id", async () => {
		const before = await snapshot(invoiced.id);
		const answer = await as(north.member, () => submit(deleteOrder, { id: String(invoiced.id) }));
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toContainEqual(
			expect.stringMatching(`${invoiced.number} is invoiced.*can't be deleted`),
		);
		expect(await snapshot(invoiced.id)).toEqual(before);
		expect(await orderId(completed.number, northId)).toBe(completed.id);
	});
});

describe("the list's status cell (`setOrderStatus`)", () => {
	test("gives an order another status, and logs it as the user's", async () => {
		const quote = await orderWith(northId, "quote");
		const answer = await as(north.member, () =>
			call(setOrderStatus, { id: quote.id, status: "scheduled" }),
		);
		expect(answer.status).toBe(200);
		expect(await value(`select status from "order" where id = ?`, [quote.id])).toBe("scheduled");
		const [latest] = await activityOf(quote.id);
		expect(latest.action).toBe("updated");
		expect(JSON.parse(latest.changes!)).toEqual({ status: ["quote", "scheduled"] });
		expect(latest.user_name).toBe(demoUsers[1].name);
	});

	test("refuses an invoiced order with a 400 that says why", async () => {
		const before = await snapshot(invoiced.id);
		expect(
			await as(north.member, () => call(setOrderStatus, { id: invoiced.id, status: "cancelled" })),
		).toMatchObject({
			status: 400,
			message: expect.stringContaining(`${invoiced.number} is invoiced`),
		});
		expect(await snapshot(invoiced.id)).toEqual(before);
	});

	test("refuses a status that can't be given by hand with a 400", async () => {
		const quote = await orderWith(northId, "quote");
		const before = await snapshot(quote.id);
		expect(
			await as(north.member, () =>
				call(setOrderStatus, { id: quote.id, status: "invoiced" } as never),
			),
		).toMatchObject({ status: 400, message: "Bad Request" });
		expect(await snapshot(quote.id)).toEqual(before);
	});

	test("doesn't find another tenant's order, by its id", async () => {
		const theirs = await orderWith(southId, "quote");
		const before = await snapshot(theirs.id);
		expect(
			await as(north.member, () => call(setOrderStatus, { id: theirs.id, status: "cancelled" })),
		).toMatchObject({ status: 404, message: "Order not found" });
		expect(await snapshot(theirs.id)).toEqual(before);
	});
});

describe("an order type the tenant hides", () => {
	test("is refused for an order that hasn't got it", async () => {
		// Hidden from the order form, as an owner does on the settings page.
		const hidden = await as(north.owner, () =>
			submit(saveOrderType, { type: "project", names: { en: "", nl: "" }, hidden: true }),
		);
		expect(hidden.status).toBe(200);
		const number = await value<string>(
			`select number from "order" where organization_id = ? and type = 'repair'
			 and status in ('quote', 'scheduled', 'in_progress') order by id limit 1`,
			[northId],
		);
		const id = await orderId(number, northId);
		const before = await snapshot(id);
		const answer = await as(north.member, async () =>
			submit(updateOrder, await editForm(north.member, number, { type: "project" })),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toContainEqual(
			expect.objectContaining({ name: "type", message: "This type is hidden: choose another one" }),
		);
		expect(await snapshot(id)).toEqual(before);

		// An order that has it keeps it.
		const project = await value<string>(
			`select number from "order" where organization_id = ? and type = 'project'
			 and status in ('quote', 'scheduled', 'in_progress') order by id limit 1`,
			[northId],
		);
		const kept = await as(north.member, async () =>
			submit(
				updateOrder,
				await editForm(north.member, project, { description: "Still a project" }),
			),
		);
		expect(kept).toMatchObject({ status: 303, location: `/orders/${project}` });
	});

	test("can't be set by a member", async () => {
		const before = await rows(`select * from order_type_setting where organization_id = ?`, [
			northId,
		]);
		expect(
			await as(north.member, () =>
				submit(saveOrderType, {
					type: "inspection",
					names: { en: "Planner's own", nl: "" },
					hidden: false,
				}),
			),
		).toMatchObject({ status: 403 });
		expect(
			await rows(`select * from order_type_setting where organization_id = ?`, [northId]),
		).toEqual(before);
	});
});

describe("an order's units", () => {
	/** North's customer with the most units, two of them, and units of another and of South. */
	let units: { customer: number; own: number[]; others: number; southern: number };

	beforeAll(async () => {
		const customer = await value<number>(
			`select c.id from customer c where c.organization_id = ? and exists (select 1 from "order" o
			 where o.customer_id = c.id and o.status in ('quote', 'scheduled'))
			 order by (select count(*) from equipment e where e.customer_id = c.id) desc, c.id limit 1`,
			[northId],
		);
		const own = (
			await rows<{ id: number }>(
				`select id from equipment where customer_id = ? order by id limit 2`,
				[customer],
			)
		).map((row) => row.id);
		const others = await value<number>(
			`select id from equipment where organization_id = ? and customer_id != ? order by id limit 1`,
			[northId, customer],
		);
		const southern = await value<number>(
			`select id from equipment where organization_id = ? order by id limit 1`,
			[southId],
		);
		units = { customer, own, others, southern };
	});

	test("are the order's customer's: another customer's or South's are refused", async () => {
		const number = await value<string>(
			`select o.number from "order" o where o.organization_id = ? and o.customer_id = ?
			 and o.status in ('quote', 'scheduled') order by o.id limit 1`,
			[northId, units.customer],
		);
		const id = await orderId(number, northId);
		const before = await snapshot(id);
		for (const unit of [units.others, units.southern]) {
			const form = await editForm(north.member, number, {
				equipmentIds: [String(unit), String(units.own[0])],
			});
			const answer = await as(north.member, () => submit(updateOrder, form));
			expect(answer.status).toBe(400);
			expect(answer.issues?.map((issue) => issue.message)).toContain(
				"One of the units belongs to another customer",
			);
			expect(await snapshot(id)).toEqual(before);
		}
	});

	test("nor are they on a new order", async () => {
		const count = () =>
			value<number>(`select count(*) from "order" where organization_id = ?`, [northId]);
		const before = await count();
		const answer = await as(north.member, () =>
			submit(createOrder, {
				customerId: String(units.customer),
				equipmentIds: [String(units.own[0]), String(units.southern)],
				engineerId: "",
				type: "repair",
				status: "quote",
				priority: "normal",
				description: "Tampered (test order)",
				scheduledFor: "",
				scheduledTime: "",
				laborHours: 0,
			}),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toContain(
			"One of the units belongs to another customer",
		);
		expect(await count()).toBe(before);
	});
});
