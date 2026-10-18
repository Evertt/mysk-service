/**
 * The live board's query (`getDockBoard` in `board/board.remote.ts`) on the seeded demo database:
 * SHLTR's docks at Weggemans with their open session and each dock's latest sessions, newest
 * first and at most five, read for all the docks at once. The page itself is `docks.test.ts`'s.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.ts";
import { getDockBoard } from "#modules/docks/board/board.remote.ts";
import { sessionColumns } from "#modules/docks/server/docks.ts";
import { as, data, organizationId, rows, shltr } from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

afterEach(() => vi.restoreAllMocks());

/** A dock of SHLTR's by code. */
const dockNamed = async (code: string) =>
	(
		await rows<{ id: number }>(
			`select id from dock_position where organization_id = ? and code = ?`,
			[shltrId, code],
		)
	)[0];

/** Dock `dockId`'s latest sessions as stored, newest first: what the board lists of it. */
const latestOf = async (dockId: number) =>
	(
		await rows<{ id: number }>(
			`select id from dock_session where organization_id = ? and dock_id = ?
			 order by checked_in_at desc, id desc limit 5`,
			[shltrId, dockId],
		)
	).map((row) => row.id);

describe("the board", () => {
	test("lists each dock's five latest sessions, newest first, in one query for all docks", async () => {
		// DOCK 07 gets seven more finished sessions on the days before: more than the board lists.
		const dock = await dockNamed("DOCK 07");
		const now = Math.floor(Date.now() / 1000);
		for (let day = 1; day <= 7; day++) {
			const at = now - day * 86_400;
			await rows(
				`insert into dock_session
					(organization_id, dock_id, plate, checked_in_at, checked_out_at, door_open_seconds)
				 values (?, ?, ?, ?, ?, 0)`,
				[shltrId, dock.id, `SPEC-${day}`, at, at + 3600],
			);
		}

		const execute = vi.spyOn(db.$client, "execute");
		const board = await as(shltr.owner, () => data(getDockBoard, undefined));
		const sessionQueries = execute.mock.calls
			.map(([statement]: unknown[]) =>
				typeof statement === "string" ? statement : (statement as { sql: string }).sql,
			)
			.filter((sql) => /from "dock_session"/.test(sql));

		expect(board.docks.length).toBeGreaterThan(2);
		for (const each of board.docks) {
			expect(
				each.sessions.map((session) => session.id),
				each.code,
			).toEqual(await latestOf(each.id));
		}
		const seventh = board.docks.find((each) => each.id === dock.id);
		expect(seventh?.sessions).toHaveLength(5);
		expect(seventh?.sessions[0].checkedInAt).toBeInstanceOf(Temporal.Instant);
		expect(Object.keys(seventh?.sessions[0] ?? {})).toEqual(Object.keys(sessionColumns));
		// The open sessions and the latest ones: two, however many docks there are.
		expect(sessionQueries).toHaveLength(2);
	});
});
