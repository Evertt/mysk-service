/**
 * What the activity log records of North's changes and what its queries answer: a customer's
 * changed field (and nothing for a refused or empty save), an order's status and its lines
 * against it (and nothing for a change refused for want of stock); the feed filtered by record
 * type, user, days and one record with its parts; South seeing none of it, also by North's ids;
 * and the changes announced to a record's open pages (`watchTenantChanges`). The server side of
 * `src/tests/e2e/activity.test.ts` and `orders.live.test.ts`, which keep the feed, the cards and
 * the live notice.
 */
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import {
	countNewActivity,
	getActivity,
	getActivityFilters,
	getRecentActivity,
	getRecordChangedAt,
	getSubjectActivity,
	watchTenantChanges,
} from "#lib/components/activity/activity.remote.ts";
import { updateCustomer } from "#lib/customers/customers.remote.ts";
import { updateOrder } from "#lib/orders/order.remote.ts";
import { announceChange, watchSubject } from "#lib/server/changes.ts";
import { demoUsers } from "#lib/server/db/demo.ts";
import {
	as,
	call,
	callBatch,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

import { editForm } from "../../../orders/server/order-form.test-support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const [admin, planner] = [demoUsers[0], demoUsers[1]];

interface Entry {
	id: number;
	user_id: string | null;
	user_name: string;
	action: string;
	subject_type: string;
	subject_id: string;
	subject_label: string;
	parent_type: string | null;
	parent_id: string | null;
	changes: Record<string, [unknown, unknown]> | null;
	note: string | null;
}

/** The log entries about a record (as subject or parent) in North, oldest first. */
async function entriesAbout(type: string, id: number | string) {
	const found = await rows<Entry & { changes: string | null }>(
		`select id, user_id, user_name, action, subject_type, subject_id, subject_label, parent_type,
		 parent_id, changes, note from activity where organization_id = ?
		 and ((subject_type = ? and subject_id = ?) or (parent_type = ? and parent_id = ?)) order by id`,
		[northId, type, String(id), type, String(id)],
	);
	return found.map((row) => ({ ...row, changes: row.changes && JSON.parse(row.changes) }));
}

/** The edit form of North's customer `code`, as the page fills it, with `changes`. */
async function customerForm(code: string, changes: Record<string, unknown> = {}) {
	const [found] = await rows<Record<string, string | number>>(
		`select id, name, segment, contact_name, email, phone, city, country from customer
		 where code = ? and organization_id = ?`,
		[code, northId],
	);
	return {
		id: String(found.id),
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

const adminId = () => value<string>(`select id from user where email = ?`, [admin.email]);

/** What North changes here, to look for from South. */
const fromNorth = { customer: 0, order: 0, number: "" };

beforeAll(async () => {
	fromNorth.customer = await value<number>(
		`select id from customer where code = 'CUST-0002' and organization_id = ?`,
		[northId],
	);
});

describe("in North, the log", () => {
	test("has a customer's changed field, and nothing of a refused or an empty save", async () => {
		const id = fromNorth.customer;
		const city = await value<string>(`select city from customer where id = ?`, [id]);
		const before = await entriesAbout("customer", id);

		const refused = await as(north.owner, async () =>
			submit(updateCustomer, await customerForm("CUST-0002", { city: "" })),
		);
		expect(refused.status).toBe(400);
		expect(refused.issues?.map((issue) => issue.name)).toEqual(["city"]);
		expect(await entriesAbout("customer", id)).toEqual(before);

		const saved = await as(north.owner, async () =>
			submit(updateCustomer, await customerForm("CUST-0002", { city: "Activityville" })),
		);
		expect(saved).toMatchObject({ status: 303, location: "/customers/CUST-0002" });
		expect((await entriesAbout("customer", id)).slice(before.length)).toEqual([
			{
				id: expect.any(Number),
				user_id: await adminId(),
				user_name: admin.name,
				action: "updated",
				subject_type: "customer",
				subject_id: String(id),
				subject_label: "CUST-0002",
				parent_type: null,
				parent_id: null,
				changes: { city: [city, "Activityville"] },
				note: null,
			},
		]);

		// Saved again as it is, nothing changes.
		await as(north.owner, async () => submit(updateCustomer, await customerForm("CUST-0002")));
		expect(await entriesAbout("customer", id)).toHaveLength(before.length + 1);
	});

	test("has an order's status, and its lines' changes against it", async () => {
		const [order] = await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? and status = 'quote'
			 and scheduled_for is null and exists (select 1 from order_line where order_id = "order".id)
			 order by priority = 'low' desc, id desc limit 1`,
			[northId],
		);
		Object.assign(fromNorth, { order: order.id, number: order.number });
		const before = await entriesAbout("order", order.id);

		await as(north.owner, async () =>
			submit(updateOrder, await editForm(north.owner, order.number, { status: "scheduled" })),
		);
		// Its lines didn't change, so only the order did.
		expect((await entriesAbout("order", order.id)).slice(before.length)).toMatchObject([
			{
				action: "updated",
				subject_type: "order",
				subject_id: String(order.id),
				subject_label: order.number,
				changes: { status: ["quote", "scheduled"] },
			},
		]);

		const [line] = await rows<{ material_id: number; quantity: number; name: string }>(
			`select l.material_id, l.quantity, m.name from order_line l
			 join material m on m.id = l.material_id where l.order_id = ? order by l.id limit 1`,
			[order.id],
		);
		const form = await editForm(north.owner, order.number);
		form.modules.materials.lines[0].quantity = line.quantity + 1;
		await as(north.owner, () => submit(updateOrder, form));
		expect((await entriesAbout("order", order.id)).slice(before.length + 1)).toMatchObject([
			{
				action: "updated",
				subject_type: "order_line",
				subject_id: String(line.material_id),
				subject_label: line.name,
				parent_type: "order",
				parent_id: String(order.id),
				changes: { quantity: [line.quantity, line.quantity + 1] },
			},
		]);
	});

	test("has nothing of a change refused for want of stock", async () => {
		const before = await entriesAbout("order", fromNorth.order);
		const form = await editForm(north.owner, fromNorth.number);
		form.modules.materials.lines[0].quantity = 100_000;
		const answer = await as(north.owner, () => submit(updateOrder, form));
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toEqual([
			expect.stringMatching(/in stock$/),
		]);
		expect(await entriesAbout("order", fromNorth.order)).toEqual(before);
	});
});

describe("in North, the feed", () => {
	const feed = (filters: Parameters<typeof getActivity>[0] = {}) =>
		as(north.owner, async () => (await data(getActivity, filters)).entries);

	test("filters by record type, user and days", async () => {
		const customers = await feed({ type: "customer" });
		expect(customers.length).toBeGreaterThan(0);
		expect(new Set(customers.map((entry) => entry.subject.type))).toEqual(new Set(["customer"]));
		expect(customers[0].subject.label).toBe("CUST-0002");

		const userId = await adminId();
		const theirs = await feed({ type: "customer", user: userId });
		expect(theirs.map((entry) => entry.id)).toContain(customers[0].id);
		const ids = theirs.map((entry) => entry.id);
		expect(
			await value(
				`select count(*) from activity where id in (${ids.join(", ")}) and user_id != ?`,
				[userId],
			),
		).toBe(0);
		// The planner hasn't changed this customer.
		const plannerId = await value<string>(`select id from user where email = ?`, [planner.email]);
		expect((await feed({ type: "customer", user: plannerId })).map((e) => e.id)).not.toContain(
			customers[0].id,
		);

		const today = Temporal.Now.plainDateISO("Europe/Amsterdam");
		const [from, to] = [today.toString(), today.toString()];
		expect((await feed({ type: "customer", from, to })).map((e) => e.id)).toContain(
			customers[0].id,
		);
		// Nothing has happened tomorrow yet.
		expect(await feed({ from: today.add({ days: 1 }).toString() })).toEqual([]);
	});

	test("of one record has it and its parts, newest first", async () => {
		const entries = await feed({ type: "order", id: String(fromNorth.order) });
		expect(entries.map((entry) => [entry.subject.type, entry.parent?.type ?? null])).toEqual([
			["order_line", "order"],
			["order", null],
		]);
		const card = await as(north.owner, () =>
			data(getSubjectActivity, { type: "order", id: String(fromNorth.order) }),
		);
		expect(card.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
	});

	test("of a record of a type the log doesn't know is refused", async () => {
		const answer = await as(north.owner, () =>
			call(getSubjectActivity, { type: "ordr" as never, id: String(fromNorth.order) }),
		);
		expect(answer).toMatchObject({ status: 400 });
	});
});

describe("in South", () => {
	test("none of North's activity shows, in the feed or the dashboard's", async () => {
		const northEntries = new Set(
			(
				await rows<{ id: number }>(`select id from activity where organization_id = ?`, [northId])
			).map((row) => row.id),
		);
		await as(south.owner, async () => {
			const { entries } = await data(getActivity, {});
			expect(entries.length).toBeGreaterThan(0);
			for (const entry of [...entries, ...(await data(getRecentActivity))]) {
				expect(northEntries.has(entry.id), entry.subject.label).toBe(false);
			}
		});
	});

	test("North's records' activity can't be loaded by their ids", async () => {
		await as(south.owner, async () => {
			for (const [type, id] of [
				["customer", fromNorth.customer],
				["order", fromNorth.order],
			] as const) {
				expect((await data(getActivity, { type, id: String(id) })).entries).toEqual([]);
				// Not found, as the record is: it isn't South's.
				expect(await call(getSubjectActivity, { type, id: String(id) })).toMatchObject({
					status: 404,
				});
			}
			// South's own customer with the same code has none of North's changes to theirs.
			const own = await value<number>(
				`select id from customer where code = 'CUST-0002' and organization_id = ?`,
				[southId],
			);
			const card = await data(getSubjectActivity, { type: "customer", id: String(own) });
			expect(
				card.flatMap((entry) => entry.changes.map((change) => JSON.stringify(change))),
			).not.toContainEqual(expect.stringContaining("Activityville"));
		});
	});
});

describe("a record's open pages", () => {
	test("are told of a change to it, and by whom", async () => {
		const watching = watchSubject(northId, { type: "customer", id: String(fromNorth.customer) });
		try {
			const next = watching[Symbol.asyncIterator]().next();
			await as(north.member, async () =>
				submit(updateCustomer, await customerForm("CUST-0002", { contactName: "Femke Jansen" })),
			);
			const { value: change } = await next;
			expect(change).toMatchObject({
				type: "customer",
				action: "updated",
				user: { name: planner.name },
			});
		} finally {
			watching.stop();
		}
	});

	test("share a feed of the tenant's changes, which starts with none", async () => {
		const { since, now, changes } = await as(north.member, () => data(watchTenantChanges));
		expect(changes).toEqual([]);
		expect(now).toBeGreaterThanOrEqual(since);
	});

	test("can ask when the tenant's record last changed, but not another tenant's", async () => {
		const theirs = await value<number>(
			`select id from "order" where organization_id = ? order by id limit 1`,
			[southId],
		);
		const before = Date.now();
		announceChange(southId, "order", { id: String(theirs) });
		announceChange(northId, "order", { id: String(fromNorth.order) });
		await as(north.owner, async () => {
			expect(
				await data(getRecordChangedAt, { type: "order", id: fromNorth.order }),
			).toBeGreaterThanOrEqual(before);
			expect(await data(getRecordChangedAt, { type: "order", id: theirs })).toBe(0);
		});
	});

	test("are the office's: a field engineer gets no feed", async () => {
		expect(await as(north.engineer, () => call(watchTenantChanges))).toMatchObject({
			status: 403,
		});
	});
});

/** The ids of North's records of a table, as text (`where` is more SQL on it). */
const idsOf = async (table: string, where = "") =>
	(
		await rows<{ id: number | string }>(
			`select id from "${table}" where organization_id = ? ${where} order by id`,
			[northId],
		)
	).map((row) => String(row.id));

/** Announces a change to each record, so it has a time worth asking for. */
const touch = (type: string, ids: readonly string[]) => {
	for (const id of ids) announceChange(northId, type, { id });
};

describe("what getRecordChangedAt answers", () => {
	const ask = (actor: typeof north.owner, ...subjects: { type: string; id: string | number }[]) =>
		as(actor, async () => {
			const { answers } = await callBatch(getRecordChangedAt, subjects as never);
			return answers;
		});

	test("is the time for a record the asker may read, and 0 for another engineer's order", async () => {
		const [mine] = await rows<{ id: number }>(
			`select o.id from "order" o join engineer e on e.id = o.engineer_id
			 join "user" u on u.id = e.user_id where u.email = ? and o.organization_id = ? limit 1`,
			[north.engineer.email, northId],
		);
		const [theirs] = await rows<{ id: number }>(
			`select o.id from "order" o where o.organization_id = ?
			 and (o.engineer_id is null or o.engineer_id not in (
			   select e.id from engineer e join "user" u on u.id = e.user_id where u.email = ?)) limit 1`,
			[northId, north.engineer.email],
		);
		touch("order", [String(mine.id), String(theirs.id)]);
		const before = Date.now() - 60_000;
		const answers = await ask(
			north.engineer,
			{ type: "order", id: mine.id },
			{ type: "order", id: theirs.id },
		);
		// Neither is refused, the batch goes on: one answer is a time, the other 0.
		expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
		expect(answers[0].data).toBeGreaterThan(before);
		expect(answers[1].data).toBe(0);
		// The office reads both.
		const office = await ask(
			north.owner,
			{ type: "order", id: mine.id },
			{ type: "order", id: theirs.id },
		);
		expect(office.map((answer) => answer.data! > before)).toEqual([true, true]);
	});

	test("is 0 for a customer's contact asking after an office-only record", async () => {
		const [member] = await idsOf("member");
		touch("member", [member]);
		const answers = await ask(north.customer, { type: "member", id: member });
		expect(answers).toMatchObject([{ status: 200, data: 0 }]);
		// A manager reads the member, a planner doesn't.
		expect((await ask(north.owner, { type: "member", id: member }))[0].data).toBeGreaterThan(0);
		expect((await ask(north.member, { type: "member", id: member }))[0].data).toBe(0);
	});

	test("is 0 for a record of a module that is off, and the time again when it is on", async () => {
		const [invoice] = await idsOf("invoice");
		expect(invoice).toBeDefined();
		touch("invoice", [invoice]);
		expect((await ask(north.owner, { type: "invoice", id: invoice }))[0].data).toBeGreaterThan(0);
		await withoutModule("north", "invoices", async () => {
			expect(await ask(north.owner, { type: "invoice", id: invoice })).toMatchObject([
				{ status: 200, data: 0 },
			]);
		});
	});
});

describe("a record's activity card", () => {
	test("is a 404 for a record of a module that is off, and for one the asker may not read", async () => {
		const [invoice] = await idsOf("invoice");
		const [member] = await idsOf("member");
		await as(north.owner, async () => {
			expect(await call(getSubjectActivity, { type: "invoice", id: invoice })).toMatchObject({
				status: 200,
			});
			expect(await call(getSubjectActivity, { type: "member", id: member })).toMatchObject({
				status: 200,
			});
		});
		await withoutModule("north", "invoices", () =>
			as(north.owner, async () => {
				expect(await call(getSubjectActivity, { type: "invoice", id: invoice })).toMatchObject({
					status: 404,
				});
			}),
		);
		// A planner is not a manager: a member's card is not theirs.
		await as(north.member, async () => {
			expect(await call(getSubjectActivity, { type: "member", id: member })).toMatchObject({
				status: 404,
			});
		});
	});
});

describe("the log's readers", () => {
	beforeAll(async () => {
		const [member] = await idsOf("member");
		const [invoice] = await idsOf("invoice");
		for (const [type, id] of [
			["member", member],
			["invoice", invoice],
		]) {
			await rows(
				`insert into activity (organization_id, user_name, action, subject_type, subject_id, subject_label)
				 values (?, 'Planted', 'updated', ?, ?, 'planted')`,
				[northId, type, id],
			);
		}
	});
	afterAll(async () => {
		await rows(`delete from activity where organization_id = ? and user_name = 'Planted'`, [
			northId,
		]);
	});

	const types = (entries: { subject: { type: string } }[]) => entries.map((e) => e.subject.type);
	const readersAs = (actor: typeof north.owner) =>
		as(actor, async () => ({
			feed: (await data(getActivity, {})).entries,
			recent: await data(getRecentActivity),
			filters: (await data(getActivityFilters)).types.map((type) => type.value),
			ofMembers: (await data(getActivity, { type: "member" })).entries,
			newMembers: await data(countNewActivity, { type: "member", after: null }),
		}));

	test("show an owner every type, a planner not the manager-only ones", async () => {
		const owner = await readersAs(north.owner);
		expect(types(owner.feed)).toEqual(expect.arrayContaining(["member", "invoice"]));
		expect(owner.filters).toEqual(expect.arrayContaining(["member", "invoice"]));
		expect(owner.ofMembers.length).toBeGreaterThan(0);
		expect(owner.newMembers).toBeGreaterThan(0);

		const planner = await readersAs(north.member);
		expect(types(planner.feed)).not.toContain("member");
		expect(types(planner.feed)).toContain("invoice");
		expect(types(planner.recent)).not.toContain("member");
		expect(planner.filters).not.toContain("member");
		expect(planner.filters).toContain("invoice");
		expect(planner.ofMembers).toEqual([]);
		expect(planner.newMembers).toBe(0);
	});

	test("hide the entries of a module that is off, and show them when it is on again", async () => {
		await withoutModule("north", "invoices", () =>
			as(north.owner, async () => {
				expect(types((await data(getActivity, {})).entries)).not.toContain("invoice");
				expect((await data(getActivity, { type: "invoice" })).entries).toEqual([]);
				expect(types(await data(getRecentActivity))).not.toContain("invoice");
				expect((await data(getActivityFilters)).types.map((t) => t.value)).not.toContain("invoice");
				expect(await data(countNewActivity, { type: "invoice", after: null })).toBe(0);
			}),
		);
		// Switched on again, they are still there.
		await as(north.owner, async () => {
			expect(types((await data(getActivity, { type: "invoice" })).entries)).toContain("invoice");
		});
	});
});
