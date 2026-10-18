/**
 * The condition settings and the daily job on the seeded demo database, in North: the defaults
 * (critical below 40, attention below 70, automatic planning off), read by every member and
 * changed by a manager only (logged with what changed); off, the daily run plans nothing; on, it
 * makes a maintenance order (a quote of high priority, saying why) for each critical unit in care
 * without an open order, once, and says so on the settings; nothing in South, which hasn't the
 * module. The server side of `condition.automatic.test.ts`, which keeps the settings page. That
 * critical stays below attention is `schemas.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { runDaily } from "#lib/server/jobs/daily.ts";
import { recordCondition } from "#modules/condition/condition.remote.ts";
import { getConditionSettings, saveConditionSettings } from "#modules/condition/settings.remote.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	signedOut,
	submit,
} from "#unit/lib/server/harness/index.ts";

import { unitStates } from "./support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The daily run, as the cron starts it; each organization's report by its id. */
const runDailyJobs = async () =>
	Object.fromEntries(
		(await signedOut(() => runDaily())).map((result) => [result.organization.id, result.report]),
	);

/** The tenant's critical units in care without an open order: what the run plans. */
async function toPlan(organization: string) {
	const open = new Set(
		(
			await rows<{ equipment_id: number }>(
				`select distinct ou.equipment_id from order_unit ou join "order" o on o.id = ou.order_id
				 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')`,
				[organization],
			)
		).map((row) => row.equipment_id),
	);
	return (await unitStates(organization)).filter(
		(unit) => unit.concern === "critical" && !open.has(unit.id),
	);
}

describe("the condition settings, in North", () => {
	test("are the defaults at first, read by a member who can't change them", async () => {
		const settings = await as(north.member, () => data(getConditionSettings));
		expect(settings).toMatchObject({
			criticalBelow: 40,
			attentionBelow: 70,
			autoPlan: false,
			lastRunAt: null,
			canManage: false,
		});
		expect(
			await as(north.member, () =>
				submit(saveConditionSettings, { criticalBelow: 40, attentionBelow: 70, autoPlan: true }),
			),
		).toMatchObject({ status: 403 });
		expect((await as(north.owner, () => data(getConditionSettings))).canManage).toBe(true);
	});

	test("off, the daily run plans nothing", async () => {
		const reports = await runDailyJobs();
		expect(reports[northId]["condition.orders"]).toBeUndefined();
	});

	test("a manager turns automatic planning on: stored and logged with what changed", async () => {
		const answer = await as(north.owner, () =>
			submit(saveConditionSettings, { criticalBelow: 40, attentionBelow: 70, autoPlan: true }),
		);
		expect(answer).toMatchObject({
			status: 303,
			location: "/condition",
			refreshed: ["getConditionSettings"],
		});
		expect(
			await rows(
				`select critical_below, attention_below, auto_plan from condition_settings
				 where organization_id = ?`,
				[northId],
			),
		).toEqual([{ critical_below: 40, attention_below: 70, auto_plan: 1 }]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where organization_id = ?
			 and subject_type = 'condition_settings' order by id desc limit 1`,
			[northId],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({ autoPlan: [false, true] });
	});
});

describe("the daily run, with automatic planning on", () => {
	test("plans each critical unit in care without an open order, once; nothing in South", async () => {
		// A unit made critical by a condition recorded in the office, so there's at least one.
		const [unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and e.status = 'operational'
			 and not exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
				where ou.equipment_id = e.id and o.status in ('quote', 'scheduled', 'in_progress'))
			 order by e.id desc limit 1`,
			[northId],
		);
		await as(north.owner, () =>
			submit(recordCondition, { serialNumber: unit.serial_number, score: 15, advice: "" }),
		);
		const planned = (await toPlan(northId)).map((each) => each.id).toSorted((a, b) => a - b);
		expect(planned).toContain(unit.id);
		const southBefore = await rows(`select id from "order" where organization_id = ?`, [southId]);

		const first = await runDailyJobs();
		expect(first[northId]["condition.orders"]).toBe(planned.length);
		const made = await rows<{
			id: number;
			status: string;
			engineer_id: number | null;
			description: string;
			equipment_id: number;
		}>(
			`select o.id, o.status, o.engineer_id, o.description, ou.equipment_id from "order" o
			 join order_unit ou on ou.order_id = o.id
			 where o.organization_id = ? and o.type = 'maintenance' and o.priority = 'high'
			 and o.status = 'quote' and ou.equipment_id in (select value from json_each(?))`,
			[northId, JSON.stringify(planned)],
		);
		expect(made.map((order) => order.equipment_id).toSorted((a, b) => a - b)).toEqual(planned);
		const ours = made.find((order) => order.equipment_id === unit.id)!;
		expect(ours).toMatchObject({ status: "quote", engineer_id: null });
		expect(ours.description).toMatch(/15%/);
		// Logged as the system's: no user.
		expect(
			await rows(
				`select action, user_id from activity where subject_type = 'order' and subject_id = ?`,
				[String(ours.id)],
			),
		).toEqual([{ action: "created", user_id: null }]);
		expect(await toPlan(northId)).toEqual([]);

		// Again: nothing more, and nothing in South, which doesn't have the module.
		const second = await runDailyJobs();
		expect(second[northId]["condition.orders"]).toBe(0);
		expect(second[southId]["condition.orders"]).toBeUndefined();
		expect(await rows(`select id from "order" where organization_id = ?`, [southId])).toEqual(
			southBefore,
		);
		// The settings say when it last ran, and what it made.
		const settings = await as(north.member, () => data(getConditionSettings));
		expect(settings.lastRunOrders).toBe(0);
		expect(settings.lastRunAt).not.toBeNull();
	});
});
