/**
 * The customer portal's bell and the reporter's mail, on the seeded demo database: a breakdown
 * Riedel's contact reports in SHLTR's portal, followed from received to resolved (accepted, planned,
 * the engineer on the way, completed), each change in the bell of the contacts who read the order
 * and mailed to the one who reported it, in their language. Weggemans' contact never hears of
 * Riedel's, South's never of SHLTR's.
 */
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { customerCategories } from "#lib/notifications/extensions.ts";
import { transitionOrder } from "#lib/orders/server/index.ts";
import { db } from "#lib/server/db/index.ts";
import type { Mail } from "#lib/server/mail/index.ts";
import { rulesFor } from "#lib/server/notifications/index.ts";
import {
	getPortalNotifications,
	getPortalUnreadNotifications,
	markPortalNotificationsSeen,
} from "#routes/(customer)/notifications.remote.ts";
import { reportBreakdown } from "#routes/(customer)/portal/client.remote.ts";
import { setOut } from "#routes/(field)/my/portal.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	demoAccount,
	organizationId,
	rows,
	shltr,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const mailed = vi.hoisted(() => [] as Mail[]);
vi.mock("#lib/server/mail/index.ts", async (importOriginal) => ({
	...(await importOriginal<object>()),
	sendMail: async (mail: Mail) => void mailed.push(mail),
}));

const shltrId = organizationId("shltr");
/** Riedel's contact, who reports; Weggemans' contact, another customer's. */
const marieke = shltr.customer;
const rob = demoAccount("rob@weggemans.example", "shltr");

/** `actor`'s portal tray entries about order `number`, newest first. */
async function tray(actor: Actor, number: string) {
	const { entries } = await as(actor, () => data(getPortalNotifications));
	return entries.filter((entry) => entry.subject.label === number);
}

const categories = async (actor: Actor, number: string) =>
	(await tray(actor, number)).map((entry) => entry.category);

/** The mails sent since `from` (an index in `mailed`), to whom and about what. */
const mailsSince = (from: number) =>
	mailed.slice(from).map((mail) => ({ to: mail.to, subject: mail.subject }));

let order: { id: number; number: string };
let levId: number;

/** Reports a breakdown of one of Riedel's units as Marieke, in the portal: the order made. */
async function report() {
	const unitId = await value<number>(
		`select e.id from equipment e join portal_contact c on c.customer_id = e.customer_id
		 join user u on u.id = c.user_id where u.email = ? and e.organization_id = ? order by e.id limit 1`,
		[marieke.email, shltrId],
	);
	const answer = await as(marieke, () =>
		submit(reportBreakdown, { unitId: String(unitId), description: "Deur klemt", urgency: "high" }),
	);
	expect(answer).toMatchObject({ status: 303 });
	const [made] = await rows<{ id: number; number: string }>(
		`select id, number from "order" where organization_id = ? order by id desc limit 1`,
		[shltrId],
	);
	return made;
}

beforeAll(async () => {
	levId = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ? and e.organization_id = ?`,
		[shltr.engineer.email, shltrId],
	);
	order = await report();
});

describe("the customer's rules", () => {
	test("have their own ids and categories", () => {
		const customer = rulesFor("customer", []);
		expect(customer.map((rule) => rule.id)).toEqual([
			"orders.customerAccepted",
			"orders.customerRejected",
			"orders.customerCancelled",
			"orders.onTheWay",
			"orders.resolved",
			"orders.customerPlanned",
		]);
		for (const rule of customer) expect(customerCategories).toContain(rule.category);
	});

	test("the report itself rings nobody's portal bell, the reporter's own least", async () => {
		expect(await categories(marieke, order.number)).toEqual([]);
	});

	test("accepted, planned, on the way and resolved, each in the bell and mailed to the reporter", async () => {
		const sent = mailed.length;
		await as(shltr.member, () =>
			db.transaction((tx) => transitionOrder(tx, { verb: "accept", id: order.id })),
		);
		expect(await categories(marieke, order.number)).toEqual(["accepted"]);
		expect(mailsSince(sent)).toEqual([
			{ to: marieke.email, subject: `Your report ${order.number} has been accepted` },
		]);

		const day = Temporal.Now.plainDateISO().add({ days: 1 });
		await as(shltr.member, () =>
			db.transaction((tx) =>
				transitionOrder(tx, { verb: "plan", id: order.id, engineerId: levId, day, time: "09:00" }),
			),
		);
		expect(await categories(marieke, order.number)).toEqual(["planned", "accepted"]);

		expect(await as(shltr.engineer, () => submit(setOut, { id: String(order.id) }))).toMatchObject({
			status: 200,
		});
		expect(await value(`select status from "order" where id = ?`, [order.id])).toBe("on_the_way");
		expect(await categories(marieke, order.number)).toEqual(["on_the_way", "planned", "accepted"]);

		// Starting the work isn't a change they follow; completing it is.
		await as(shltr.engineer, () =>
			db.transaction((tx) => transitionOrder(tx, { verb: "start", id: order.id })),
		);
		await as(shltr.engineer, () =>
			db.transaction((tx) =>
				transitionOrder(tx, {
					verb: "complete",
					id: order.id,
					signoff: { signerName: "Marieke", signature: "data:,", engineerSignature: "data:," },
				}),
			),
		);
		expect(await categories(marieke, order.number)).toEqual([
			"resolved",
			"on_the_way",
			"planned",
			"accepted",
		]);
		expect(mailsSince(sent).map((mail) => mail.subject)).toEqual([
			`Your report ${order.number} has been accepted`,
			`An engineer is scheduled for ${order.number}`,
			`The engineer is on the way for ${order.number}`,
			`${order.number} is resolved`,
		]);
		expect(mailed.at(-1)!.text).toContain(`/portal/orders/${order.number}`);
	});

	test("the tray names the tenant, not who in it, and only the status and planned time", async () => {
		const entries = await tray(marieke, order.number);
		expect(new Set(entries.map((entry) => entry.user))).toEqual(new Set(["SHLTR"]));
		const planned = entries.find((entry) => entry.category === "planned")!;
		// The plan also gave it its engineer: not in the customer's tray.
		expect(planned.changes.map((change) => change.field)).toEqual(["scheduled for", "status"]);
	});

	test("the dot counts them until the tray is marked seen", async () => {
		const unread = await as(marieke, () => data(getPortalUnreadNotifications));
		expect(unread.count).toBeGreaterThanOrEqual(4);
		const [newest] = await tray(marieke, order.number);
		expect(await as(marieke, () => call(markPortalNotificationsSeen, newest.id))).toMatchObject({
			status: 200,
		});
		expect(await as(marieke, () => data(getPortalUnreadNotifications))).toEqual({
			count: 0,
			newest: null,
		});
	});
});

describe("the reporter's mail", () => {
	test("is in the language they reported in; accepted and planned at once is one mail", async () => {
		const [other] = await rows<{ id: number }>(
			`select o.id from "order" o join order_request r on r.order_id = o.id
			 where o.organization_id = ? and o.status = 'awaiting_acceptance' order by o.id limit 1`,
			[shltrId],
		);
		await rows(`update order_request set reporter_locale = 'nl' where order_id = ?`, [other.id]);
		const number = await value<string>(`select number from "order" where id = ?`, [other.id]);
		const sent = mailed.length;
		await as(shltr.member, () =>
			db.transaction((tx) =>
				transitionOrder(tx, {
					verb: "accept",
					id: other.id,
					plan: {
						engineerId: levId,
						day: Temporal.Now.plainDateISO().add({ days: 2 }),
						time: "10:00",
					},
				}),
			),
		);
		const mails = mailed.slice(sent);
		expect(mails.map((mail) => mail.subject)).toEqual([
			`Er is een monteur ingepland voor ${number}`,
		]);
		expect(mails[0].text).toMatch(/^Hallo /);
	});

	test("a rejection mails the reason", async () => {
		const [other] = await rows<{ id: number }>(
			`select o.id from "order" o join order_request r on r.order_id = o.id
			 where o.organization_id = ? and o.status = 'awaiting_acceptance' order by o.id limit 1`,
			[shltrId],
		);
		const sent = mailed.length;
		await as(shltr.member, () =>
			db.transaction((tx) =>
				transitionOrder(tx, { verb: "reject", id: other.id, reason: "Not our door" }),
			),
		);
		// A report from before the language was kept: in Dutch, the fallback.
		expect(mailed.slice(sent).map((mail) => mail.text)).toEqual([
			expect.stringContaining("De reden: Not our door"),
		]);
	});

	test("an order the office made mails nobody", async () => {
		const sent = mailed.length;
		const [made] = await rows<{ id: number }>(
			`select o.id from "order" o where o.organization_id = ? and o.status = 'quote'
			 and not exists (select 1 from order_request r where r.order_id = o.id) order by o.id limit 1`,
			[shltrId],
		);
		await as(shltr.member, () =>
			db.transaction((tx) => transitionOrder(tx, { verb: "set", id: made.id, to: "cancelled" })),
		);
		expect(mailsSince(sent)).toEqual([]);
	});

	test("a reporter who may no longer read the order isn't mailed", async () => {
		const other = await report();
		await rows(
			`update portal_contact set all_sites = 0 where organization_id = ? and user_id = (select id from user where email = ?)`,
			[shltrId, marieke.email],
		);
		const sent = mailed.length;
		try {
			await as(shltr.member, () =>
				db.transaction((tx) => transitionOrder(tx, { verb: "accept", id: other.id })),
			);
			expect(mailsSince(sent)).toEqual([]);
		} finally {
			await rows(
				`update portal_contact set all_sites = 1 where organization_id = ? and user_id = (select id from user where email = ?)`,
				[shltrId, marieke.email],
			);
		}
	});
});

describe("isolation", () => {
	test("another customer's contact never hears of Riedel's order", async () => {
		expect(await categories(rob, order.number)).toEqual([]);
		const { entries } = await as(rob, () => data(getPortalNotifications));
		const ids = entries.map((entry) => entry.id);
		const riedels = await rows(
			`select a.id from activity a where a.subject_type = 'order' and a.subject_id = ?
			 and a.id in (select value from json_each(?))`,
			[String(order.id), JSON.stringify(ids)],
		);
		expect(riedels).toEqual([]);
	});

	test("South's contact never sees SHLTR's entries, nor marks them seen", async () => {
		const { entries } = await as(south.customer, () => data(getPortalNotifications));
		const theirs = await rows(
			`select id from activity where organization_id = ? and id in (select value from json_each(?))`,
			[shltrId, JSON.stringify(entries.map((entry) => entry.id))],
		);
		expect(theirs).toEqual([]);
		const [newest] = await tray(marieke, order.number);
		expect(
			await as(south.customer, () => call(markPortalNotificationsSeen, newest.id)),
		).toMatchObject({ status: 404 });
	});
});
