/**
 * The energy module's part of a unit's timeline: a door's openings grouped so a busy door doesn't
 * flood it (one at least its threshold long on its own, the shorter ones per hour), and, on the
 * seeded demo, D-07's against its events in SQL: every opening counted once, today's figures as
 * the events say, its alerts for the office only.
 */
import { describe, expect, test } from "vite-plus/test";

import { getPortalUnitTimeline, getUnitTimeline } from "#lib/equipment/timeline/timeline.remote.ts";
import { STORY_UNIT } from "#lib/server/db/seed/unit-story.ts";
import { openings } from "#modules/energy/model.ts";
import { openingEntries, type UnitDoor } from "#modules/energy/server/timeline.ts";
import { as, data, organizationId, rows, shltr, value } from "#unit/lib/server/harness/index.ts";
import { at } from "#unit/temporal-support.ts";

const door: UnitDoor = { id: 7, code: "D-07", lossKw: 12, thresholdMinutes: 10 };

/** Events of a door opening at each `[open, close]`. */
const events = (...times: [string, string][]) =>
	times.flatMap(([open, close]) => [
		{ at: at(open), open: true },
		{ at: at(close), open: false },
	]);

describe("openingEntries", () => {
	test("a long opening is its own entry; the short ones roll up per hour", () => {
		const own = openings(
			events(
				["2026-11-18 08:01", "2026-11-18 08:03"],
				["2026-11-18 08:12", "2026-11-18 08:26"],
				["2026-11-18 08:40", "2026-11-18 08:41"],
				["2026-11-18 09:05", "2026-11-18 09:07"],
			),
		);
		const entries = openingEntries(
			[door],
			new Map([[door.id, own]]),
			at("2026-11-18 00:00"),
			at("2026-11-19 00:00"),
			at("2026-11-18 12:00"),
		);
		const long = entries.find((entry) => entry.kind === "energy.opening");
		expect(long?.at).toEqual(at("2026-11-18 08:12"));
		expect(long?.title).toBe("14 min open — energy loss measured");
		// 14 minutes of 12 kW: 2.8 kWh.
		expect(long?.detail).toBe("2.8 kWh lost");
		const hours = entries.filter((entry) => entry.kind === "energy.hour");
		expect(hours.map((entry) => entry.at)).toEqual([
			at("2026-11-18 08:00"),
			at("2026-11-18 09:00"),
		]);
		// 08:01 for 2 minutes and 08:40 for 1: 3 minutes of 12 kW.
		expect(hours[0].title).toBe("2× opened · 0.6 kWh lost");
		expect(hours[1].title).toBe("1× opened · 0.4 kWh lost");
	});

	test("leaves out openings that started outside the window, and counts a still open one to now", () => {
		const own = openings([
			...events(["2026-11-17 23:50", "2026-11-18 00:05"]),
			{ at: at("2026-11-18 11:30"), open: true },
		]);
		const entries = openingEntries(
			[door],
			new Map([[door.id, own]]),
			at("2026-11-18 00:00"),
			at("2026-11-19 00:00"),
			at("2026-11-18 11:45"),
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ kind: "energy.opening", at: at("2026-11-18 11:30") });
	});
});

describe("D-07 on the demo", () => {
	test("tells each of its openings once, as its events have them", async () => {
		const shltrId = organizationId("shltr");
		const serial = await value<string>(
			`select serial_number from equipment where organization_id = ? and name = ?`,
			[shltrId, STORY_UNIT],
		);
		const [doorRow] = await rows<{ id: number; threshold: number }>(
			`select d.id, d.threshold_minutes as threshold from energy_door d
			 join equipment e on e.id = d.equipment_id where e.serial_number = ? and d.organization_id = ?`,
			[serial, shltrId],
		);
		const seen = [];
		let before: { at: string; id: string } | undefined;
		for (let pages = 0; pages < 400; pages++) {
			const page = await as(shltr.member, () => data(getUnitTimeline, { serial, before }));
			seen.push(...page.entries);
			if (!page.next) break;
			before = { at: page.next.at.toString(), id: page.next.id };
		}
		// Every opening, by its events: the long ones each, the others in their hour's count.
		const opened = await value<number>(
			`select count(*) from energy_door_event where door_id = ? and open = 1`,
			[doorRow.id],
		);
		const counted = seen.reduce((sum, entry) => {
			if (entry.kind === "energy.opening") return sum + 1;
			if (entry.kind === "energy.hour") return sum + Number(entry.title.split("×")[0]);
			return sum;
		}, 0);
		expect(counted).toBe(opened);
		expect(seen.filter((entry) => entry.kind === "energy.opening").length).toBeGreaterThan(0);
	});

	test("the alerts are the office's: the customer's contact reads the openings without them", async () => {
		const serial = await value<string>(
			`select serial_number from equipment where organization_id = ? and name = ?`,
			[organizationId("shltr"), STORY_UNIT],
		);
		const page = await as(shltr.customer, () => data(getPortalUnitTimeline, { serial }));
		const kinds = page.entries.map((entry) => entry.kind);
		expect(kinds).toContain("energy.opening");
		expect(kinds).not.toContain("energy.alert");
	});
});
