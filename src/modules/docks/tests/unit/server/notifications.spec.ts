/**
 * The docks' notification rule (`server/notifications.ts`), on the seeded demo database: a door
 * alert or escalation the rules raise (as the system) rings the office's bell, as an alert; not one
 * logged by someone, and none while SHLTR has the docks off.
 */
import { describe, expect, test } from "vite-plus/test";

import type { ActivityAction } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { notificationTray } from "#lib/server/notifications/index.ts";
import { as, asSystem, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

/** Logs a dock's entry, by `action`. */
const log = (action: ActivityAction, label: string) => () =>
	db.transaction((tx: Transaction) =>
		recordActivity(tx, { action, subject: { type: "dock", id: 990_001, label } }),
	);

/** The categories of the planner's notifications about the dock labelled `label`. */
const categories = (label: string) =>
	as(shltr.member, async () =>
		(await notificationTray("office")).entries
			.filter((each) => each.subject.label === label)
			.map((each) => each.category),
	);

describe("the docks' notifications", () => {
	test("a door alert and its escalation, as the rules raise them, are alerts", async () => {
		await asSystem("shltr", log("door_alert", "DOCK N1"));
		await asSystem("shltr", log("door_escalated", "DOCK N1"));
		expect(await categories("DOCK N1")).toEqual(["alerts", "alerts"]);
	});

	test("not one logged by someone", async () => {
		await as(shltr.owner, log("door_alert", "DOCK N2"));
		expect(await categories("DOCK N2")).toEqual([]);
	});

	test("none while the docks are off", async () => {
		await asSystem("shltr", log("door_alert", "DOCK N3"));
		expect(await withoutModule("shltr", "docks", () => categories("DOCK N3"))).toEqual([]);
	});
});
