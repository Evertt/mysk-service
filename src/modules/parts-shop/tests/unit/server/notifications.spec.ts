/**
 * The parts shop's notification rule (`server/notifications.ts`), on the seeded demo database: an
 * order a customer places in the shop rings the office's bell, as a customer report; not the
 * office's own steps with it, and none while SHLTR has the shop off.
 */
import { describe, expect, test } from "vite-plus/test";

import type { ActivityAction } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { notificationTray } from "#lib/server/notifications/index.ts";
import { as, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

/** Logs a shop order's entry, by `action`. */
const log = (action: ActivityAction, label: string) => () =>
	db.transaction((tx: Transaction) =>
		recordActivity(tx, { action, subject: { type: "shop_order", id: 990_001, label } }),
	);

/** The categories of the planner's notifications about the shop order labelled `label`. */
const categories = (label: string) =>
	as(shltr.member, async () =>
		(await notificationTray("office")).entries
			.filter((each) => each.subject.label === label)
			.map((each) => each.category),
	);

describe("the parts shop's notifications", () => {
	test("an order a customer places is a customer report", async () => {
		await as(shltr.customer, log("placed", "SH-N1"));
		expect(await categories("SH-N1")).toEqual(["reports"]);
	});

	test("not the office's step with it", async () => {
		await as(shltr.owner, log("updated", "SH-N2"));
		expect(await categories("SH-N2")).toEqual([]);
	});

	test("none while the shop is off", async () => {
		await as(shltr.customer, log("placed", "SH-N3"));
		expect(await withoutModule("shltr", "parts-shop", () => categories("SH-N3"))).toEqual([]);
	});
});
