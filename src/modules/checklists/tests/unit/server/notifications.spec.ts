/**
 * The checklists' notification rule (`server/notifications.ts`), on the seeded demo database: a
 * checklist completed with rejected points rings the office's bell, as field progress; one
 * completed with none doesn't, and none while the tenant has checklists off.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { recordActivity } from "#lib/server/activity/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { notificationTray } from "#lib/server/notifications/index.ts";
import { as, rows, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

interface Found {
	id: number;
	organization: string;
}

/** A checklist with a rejected point, and one without, of the same tenant. */
let rejected: number;
let passed: number;

beforeAll(async () => {
	const nok = `exists (select 1 from checklist_result r where r.checklist_id = c.id and r.result = 'nok')`;
	const shltrChecklists = (where: string) =>
		rows<Found>(
			`select c.id, c.organization_id as organization from checklist c
			 where c.organization_id = 'org-shltr' and ${where} order by c.id limit 1`,
		);
	[{ id: rejected }] = await shltrChecklists(nok);
	[{ id: passed }] = await shltrChecklists(`not ${nok}`);
});

/** Logs the completion of checklist `id`, labelled `label`, by SHLTR's engineer. */
const complete = (id: number, label: string) =>
	as(shltr.engineer, () =>
		db.transaction((tx: Transaction) =>
			recordActivity(tx, { action: "completed", subject: { type: "checklist", id, label } }),
		),
	);

/** The categories of the planner's notifications about the checklist labelled `label`. */
const categories = (label: string) =>
	as(shltr.member, async () =>
		(await notificationTray("office")).entries
			.filter((each) => each.subject.label === label)
			.map((each) => each.category),
	);

describe("the checklists' notifications", () => {
	test("a checklist completed with rejected points is field progress", async () => {
		await complete(rejected, "CL-N1");
		expect(await categories("CL-N1")).toEqual(["field"]);
	});

	test("not one completed without", async () => {
		await complete(passed, "CL-N2");
		expect(await categories("CL-N2")).toEqual([]);
	});

	test("none while checklists are off", async () => {
		await complete(rejected, "CL-N3");
		expect(await withoutModule("shltr", "checklists", () => categories("CL-N3"))).toEqual([]);
	});
});
