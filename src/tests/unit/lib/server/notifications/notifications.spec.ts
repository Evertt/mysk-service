/**
 * Notifications, on the seeded demo database: which activity entries ring whose bell, by the core's
 * rules (the modules' are in their own specs), the read state, and the tenant's limits. The office's
 * through `shell.remote.ts`, the engineer portal's through its `notifications.remote.ts`.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { moduleIds } from "#lib/modules/ids.ts";
import {
	engineerCategories,
	type NotificationCategory,
	officeCategories,
} from "#lib/notifications/extensions.ts";
import {
	assignOrder,
	createOrders,
	type OrderDraft,
	removeOrder,
	transitionOrder,
} from "#lib/orders/server/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { db } from "#lib/server/db/index.ts";
import { notificationsFor, rulesFor } from "#lib/server/notifications/index.ts";
import { getNotifications, markNotificationsSeen, watchShell } from "#routes/(app)/shell.remote.ts";
import { reportBreakdown } from "#routes/(customer)/portal/client.remote.ts";
import { getMyNotifications } from "#routes/(field)/notifications.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	asSystem,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const northId = organizationId("north");
const erik = north.engineer;

/** The categories of `actor`'s office tray entries about the record labelled `label`, newest first. */
async function officeTray(actor: Actor, label: string): Promise<NotificationCategory[]> {
	const { entries } = await as(actor, () => data(getNotifications));
	return entries.filter((entry) => entry.subject.label === label).map((entry) => entry.category);
}

/** The engineer's tray entries about order `number`, newest first: category and link. */
async function engineerTray(actor: Actor, number: string) {
	const { entries } = await as(actor, () => data(getMyNotifications));
	return entries
		.filter((entry) => entry.subject.label === number)
		.map((entry) => ({ category: entry.category, link: entry.link }));
}

/** An order of North's customer `customerId`, as the office makes one. */
const draft = (customerId: number, extra: Partial<OrderDraft> = {}): OrderDraft => ({
	customerId,
	type: "repair",
	description: "Notification test",
	...extra,
});

let customerId: number;
/** Erik's engineer record, and another of North's engineers. */
let erikId: number;
let otherId: number;

beforeAll(async () => {
	customerId = await value<number>(
		`select id from customer where organization_id = ? order by id limit 1`,
		[northId],
	);
	erikId = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ? and e.organization_id = ?`,
		[erik.email, northId],
	);
	otherId = await value<number>(
		`select id from engineer where organization_id = ? and id <> ? and active = 1 order by id limit 1`,
		[northId, erikId],
	);
});

/** Makes an order as `actor`, answering its id and number. */
const makeOrder = (actor: Actor, extra: Partial<OrderDraft> = {}) =>
	as(actor, () =>
		db.transaction(async (tx) => (await createOrders(tx, [draft(customerId, extra)]))[0]),
	);

describe("the rules", () => {
	test("have unique ids, and each audience its own categories, the modules' too", () => {
		const office = rulesFor("office", moduleIds);
		const engineer = rulesFor("engineer", moduleIds);
		const ids = [...office, ...engineer].map((rule) => rule.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(office.map((rule) => rule.id)).toEqual(
			expect.arrayContaining([
				"docks.doorAlerts",
				"energy.alerts",
				"checklists.rejected",
				"parts-shop.placed",
			]),
		);
		for (const rule of office) expect(officeCategories).toContain(rule.category);
		for (const rule of engineer) expect(engineerCategories).toContain(rule.category);
		// The core's first, in the order that picks a category; a module that's off adds none.
		expect(rulesFor("office", []).map((rule) => rule.id)).toEqual([
			"orders.reported",
			"orders.automatic",
			"orders.fieldProgress",
			"records.mine",
		]);
	});
});

describe("the office's rules", () => {
	test("a breakdown a customer reports in the portal is a customer report", async () => {
		const unitId = await value<number>(
			`select e.id from equipment e join portal_contact c on c.customer_id = e.customer_id
			 join user u on u.id = c.user_id where u.email = ? and e.organization_id = ? order by e.id limit 1`,
			[north.customer.email, northId],
		);
		const answer = await as(north.customer, () =>
			submit(reportBreakdown, {
				unitId: String(unitId),
				description: "It leaks",
				urgency: "high",
			}),
		);
		expect(answer).toMatchObject({ status: 303 });
		const number = await value<string>(
			`select number from "order" where organization_id = ? order by id desc limit 1`,
			[northId],
		);
		expect(await officeTray(north.member, number)).toEqual(["reports"]);
		// An order the office makes isn't one.
		const made = await makeOrder(north.owner);
		expect(await officeTray(north.member, made.number)).toEqual([]);
	});

	test("an order the system makes by itself is an alert", async () => {
		const [made] = await asSystem("north", () =>
			db.transaction((tx) => createOrders(tx, [draft(customerId)])),
		);
		expect(await officeTray(north.member, made.number)).toEqual(["alerts"]);
	});

	test("the engineer starting and completing work is field progress; the office's change isn't", async () => {
		const made = await makeOrder(north.owner, {
			engineerId: erikId,
			status: "scheduled",
			scheduledFor: Temporal.Now.instant(),
		});
		await as(erik, () =>
			db.transaction((tx) => transitionOrder(tx, { verb: "start", id: made.id })),
		);
		expect(await officeTray(north.member, made.number)).toEqual(["field"]);
		// The owner made it: their own entries never ring, the engineer's change of their record does.
		expect(await officeTray(north.owner, made.number)).toEqual(["field"]);
		await as(north.admin, () =>
			db.transaction((tx) => transitionOrder(tx, { verb: "set", id: made.id, to: "scheduled" })),
		);
		// The admin's change is the owner's record's (they made it), not field progress for the member.
		expect(await officeTray(north.member, made.number)).toEqual(["field"]);
		expect(await officeTray(north.owner, made.number)).toEqual(["mine", "field"]);
	});

	test("changes to my records: one I created, and one I changed last", async () => {
		const subject = { type: "customer" as const, id: 990_001, label: "NOTIFY-1" };
		const log = (actor: Actor, action: "created" | "updated") =>
			as(actor, () => db.transaction((tx) => recordActivity(tx, { action, subject })));
		await log(north.admin, "created");
		await log(north.member, "updated");
		// The admin created it; the member's own change isn't theirs to hear of.
		expect(await officeTray(north.admin, "NOTIFY-1")).toEqual(["mine"]);
		expect(await officeTray(north.member, "NOTIFY-1")).toEqual([]);
		await log(north.owner, "updated");
		// The member changed it last before the owner: they hear of it, and the admin still does.
		expect(await officeTray(north.member, "NOTIFY-1")).toEqual(["mine"]);
		expect(await officeTray(north.admin, "NOTIFY-1")).toEqual(["mine", "mine"]);
		// Neither the owner, whose record it isn't, nor anything the owner did themselves.
		expect(await officeTray(north.owner, "NOTIFY-1")).toEqual([]);
	});
});

describe("the engineer's rules", () => {
	let order: { id: number; number: string };

	beforeAll(async () => {
		order = await makeOrder(north.owner);
	});

	test("an order assigned to them, linked to its page in the portal", async () => {
		await as(north.owner, () => assignOrder(order.id, erikId));
		expect(await engineerTray(erik, order.number)).toEqual([
			{ category: "assigned", link: order.number },
		]);
	});

	test("planned or moved while theirs", async () => {
		const day = Temporal.Now.plainDateISO().add({ days: 3 });
		await as(north.owner, () =>
			db.transaction((tx) =>
				transitionOrder(tx, { verb: "plan", id: order.id, engineerId: erikId, day, time: "10:00" }),
			),
		);
		expect((await engineerTray(erik, order.number)).map((entry) => entry.category)).toEqual([
			"planned",
			"assigned",
		]);
	});

	test("taken off them: they still hear of it, without a link; the new engineer's don't reach them", async () => {
		await as(north.owner, () => assignOrder(order.id, otherId));
		const after = await engineerTray(erik, order.number);
		expect(after[0]).toEqual({ category: "unassigned", link: null });
		// While it's someone else's, its moves aren't theirs.
		const day = Temporal.Now.plainDateISO().add({ days: 4 });
		await as(north.owner, () =>
			db.transaction((tx) =>
				transitionOrder(tx, {
					verb: "plan",
					id: order.id,
					engineerId: otherId,
					day,
					time: "11:00",
				}),
			),
		);
		expect(await engineerTray(erik, order.number)).toEqual(after);
	});

	test("another engineer's order, made and planned for them, never reaches them", async () => {
		const others = await makeOrder(north.owner, { engineerId: otherId });
		await as(north.owner, () =>
			db.transaction((tx) =>
				transitionOrder(tx, {
					verb: "plan",
					id: others.id,
					engineerId: otherId,
					day: Temporal.Now.plainDateISO().add({ days: 2 }),
					time: "09:00",
				}),
			),
		);
		expect(await engineerTray(erik, others.number)).toEqual([]);
	});

	test("an order made for them is assigned to them", async () => {
		const made = await makeOrder(north.owner, { engineerId: erikId });
		expect(await engineerTray(erik, made.number)).toEqual([
			{ category: "assigned", link: made.number },
		]);
	});

	test("cancelled or deleted while theirs", async () => {
		const cancelled = await makeOrder(north.owner, { engineerId: erikId });
		await as(north.owner, () =>
			db.transaction((tx) =>
				transitionOrder(tx, { verb: "set", id: cancelled.id, to: "cancelled" }),
			),
		);
		expect((await engineerTray(erik, cancelled.number))[0].category).toBe("cancelled");
		const deleted = await makeOrder(north.owner, { engineerId: erikId });
		await as(north.owner, () => removeOrder(deleted.id));
		expect(await engineerTray(erik, deleted.number)).toEqual([
			{ category: "cancelled", link: null },
			{ category: "assigned", link: null },
		]);
	});
});

describe("read state", () => {
	test("marking as seen up to an entry leaves newer ones unread", async () => {
		const { entries } = await as(north.member, () => data(getNotifications));
		const newest = entries[0].id;
		expect(await as(north.member, () => call(markNotificationsSeen, newest))).toMatchObject({
			status: 200,
		});
		expect(await as(north.member, () => data(watchShell))).toMatchObject({
			notifications: { count: 0, newest: null },
		});
		const [made] = await asSystem("north", () =>
			db.transaction((tx) => createOrders(tx, [draft(customerId)])),
		);
		const unread = await as(north.member, () => data(watchShell));
		expect(unread.notifications.count).toBe(1);
		expect(unread.notifications.newest).toBeGreaterThan(newest);
		const tray = await as(north.member, () => data(getNotifications));
		expect(tray.lastSeen).toBe(newest);
		expect(
			tray.entries.filter((entry) => entry.unread).map((entry) => entry.subject.label),
		).toEqual([made.number]);
		// Never back: an older entry leaves it where it is.
		await as(north.member, () => call(markNotificationsSeen, entries.at(-1)!.id));
		expect((await as(north.member, () => data(getNotifications))).lastSeen).toBe(newest);
	});

	test("counts up to a cap", async () => {
		await asSystem("north", () =>
			db.transaction((tx) =>
				createOrders(
					tx,
					Array.from({ length: 12 }, () => draft(customerId)),
				),
			),
		);
		const unread = await as(north.member, async () => (await notificationsFor("office")).unread());
		expect(unread.count).toBe(10);
	});
});

describe("tenancy", () => {
	test("South never sees North's entries, in the office nor in the portal", async () => {
		// South's engineer gets an order of South's, so their tray isn't empty either.
		const southCustomer = await value<number>(
			`select id from customer where organization_id = ? order by id limit 1`,
			[organizationId("south")],
		);
		const southEngineer = await as(south.engineer, () =>
			value<number>(
				`select e.id from engineer e join user u on u.id = e.user_id where u.email = ?`,
				[south.engineer.email],
			),
		);
		await as(south.owner, () =>
			db.transaction((tx) =>
				createOrders(tx, [draft(southCustomer, { engineerId: southEngineer })]),
			),
		);
		const office = await as(south.owner, () => data(getNotifications));
		const portal = await as(south.engineer, () => data(getMyNotifications));
		const ids = [...office.entries, ...portal.entries].map((entry) => entry.id);
		expect(portal.entries.length).toBeGreaterThan(0);
		const northern = await rows(
			`select id from activity where organization_id = ? and id in (select value from json_each(?))`,
			[northId, JSON.stringify(ids)],
		);
		expect(northern).toEqual([]);
	});

	test("a tampered entry of North's is a 404 for South, and stores nothing", async () => {
		const northern = await value<number>(`select max(id) from activity where organization_id = ?`, [
			northId,
		]);
		expect(await as(south.owner, () => call(markNotificationsSeen, northern))).toMatchObject({
			status: 404,
		});
		expect(
			await rows(`select * from notification_seen where organization_id = ?`, [
				organizationId("south"),
			]),
		).toEqual([]);
	});
});
