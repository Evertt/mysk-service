/**
 * Energy's notification rule (`server/notifications.ts`), on the seeded demo database: an alert
 * the readings raise (made by the system) rings the office's bell, as an alert; not an alert's
 * other entries, and none while SHLTR has energy off.
 */
import { describe, expect, test } from "vite-plus/test";

import type { ActivityAction } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { notificationTray } from "#lib/server/notifications/index.ts";
import { as, asSystem, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

/** Logs an alert's entry, by `action`. */
const log = (action: ActivityAction, label: string) => () =>
	db.transaction((tx: Transaction) =>
		recordActivity(tx, { action, subject: { type: "energy_alert", id: 990_001, label } }),
	);

/** The categories of the planner's notifications about the alert labelled `label`. */
const categories = (label: string) =>
	as(shltr.member, async () =>
		(await notificationTray("office")).entries
			.filter((each) => each.subject.label === label)
			.map((each) => each.category),
	);

describe("energy's notifications", () => {
	test("an alert the readings raise is an alert", async () => {
		await asSystem("shltr", log("created", "Z-N1"));
		expect(await categories("Z-N1")).toEqual(["alerts"]);
	});

	test("not when it's resolved by the system", async () => {
		await asSystem("shltr", log("alert_resolved", "Z-N2"));
		expect(await categories("Z-N2")).toEqual([]);
	});

	test("none while energy is off", async () => {
		await asSystem("shltr", log("created", "Z-N3"));
		expect(await withoutModule("shltr", "energy", () => categories("Z-N3"))).toEqual([]);
	});

	test("making an alert into an order is someone's own doing, not a notification of its own", async () => {
		// The system made the alert, so it's no one's record to hear of changes to.
		await asSystem("shltr", log("created", "Z-N4"));
		await as(shltr.owner, log("alert_ordered", "Z-N4"));
		expect(await categories("Z-N4")).toEqual(["alerts"]);
	});
});
