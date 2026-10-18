/**
 * The test clock (`src/tests/clock/clock.ts`): what `TEST_NOW` means, and that it moves `Date`,
 * `Temporal.Now` and SQLite's clock by its offset, and nothing without it. Each test undoes what it
 * moved, so the files after it in the worker run on the clock they had (also in a `TEST_NOW` run,
 * where this worker's clock is moved already: the checks are relative to it).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
	installTestClock,
	parseTestNow,
	shiftClock,
	shiftLibsql,
	shiftSchemaDefaults,
	shiftSql,
	testNowOffset,
} from "#clock/clock.ts";

const HOUR = 60 * 60 * 1000;
const YEAR = 365 * 24 * HOUR;

const undo: (() => void)[] = [];
afterEach(() => {
	while (undo.length) undo.pop()!();
});

describe("TEST_NOW", () => {
	const zone = "Europe/Amsterdam";
	// 2026-10-18 13:14:15 in Amsterdam (summer time).
	const now = Date.UTC(2026, 9, 18, 11, 14, 15);

	test("a day is that day at this moment's time of day, in the zone", () => {
		expect(parseTestNow("2027-01-01", zone, now).toString()).toBe("2027-01-01T12:14:15Z");
	});

	test("a time on a day is that time in the zone, also on a clock change", () => {
		expect(parseTestNow("2027-01-01T07:45", zone, now).toString()).toBe("2027-01-01T06:45:00Z");
		expect(parseTestNow("2027-07-01T07:45:30", zone, now).toString()).toBe("2027-07-01T05:45:30Z");
		// 02:30 isn't on the clocks the night they go forward: it's taken for 03:30 summer time.
		expect(parseTestNow("2027-03-28T02:30", zone, now).toString()).toBe("2027-03-28T01:30:00Z");
	});

	test("an instant is that instant", () => {
		expect(parseTestNow("2027-01-01T06:45Z", zone, now).toString()).toBe("2027-01-01T06:45:00Z");
		expect(parseTestNow("2027-01-01T08:45+02:00", zone, now).toString()).toBe(
			"2027-01-01T06:45:00Z",
		);
	});

	test("anything else is refused, naming the forms", () => {
		for (const value of ["tomorrow", "2027-13-01", "01-01-2027"]) {
			expect(() => parseTestNow(value, zone, now)).toThrow(/is not a day \(2027-01-01\)/);
		}
	});

	test("its offset is noted for the processes started later, which take it", () => {
		const env: Record<string, string | undefined> = { TEST_NOW: "2030-06-15T12:00:00Z" };
		const offset = testNowOffset(env)!;
		// From the real now, also where this worker's clock is moved already.
		const later = testNowOffset({ TEST_NOW: "2030-06-15T13:00:00Z" })!;
		expect(Math.abs(later - offset - HOUR)).toBeLessThan(1000);
		expect(offset).toBeGreaterThan(3 * YEAR);
		expect(env.TEST_NOW_OFFSET_MS).toBe(String(offset));
		expect(testNowOffset({ ...env, TEST_NOW_OFFSET_MS: "1234" })).toBe(1234);
	});

	test("without it there's no offset, and nothing is moved", async () => {
		const env: Record<string, string | undefined> = { NODE_OPTIONS: "--max-old-space-size=4096" };
		const { Date: before } = globalThis;
		expect(testNowOffset(env)).toBeUndefined();
		expect(await installTestClock(env)).toBeUndefined();
		expect(globalThis.Date).toBe(before);
		expect(env).toEqual({ NODE_OPTIONS: "--max-old-space-size=4096" });
	});
});

describe("the clock moved a year on", () => {
	test("moves Date.now(), new Date() and Date(), and leaves the rest of Date alone", () => {
		const RealDate = Date;
		const before = Date.now();
		undo.push(shiftClock(YEAR));
		expect(Date.now() - before).toBeGreaterThanOrEqual(YEAR);
		expect(Date.now() - before).toBeLessThan(YEAR + 1000);
		expect(new Date().getTime() - before).toBeGreaterThanOrEqual(YEAR);
		expect(new Date().getTime() - before).toBeLessThan(YEAR + 1000);
		expect(new RealDate(Date()).getFullYear()).toBe(new RealDate(before + YEAR).getFullYear());
		expect(new Date(0).toISOString()).toBe("1970-01-01T00:00:00.000Z");
		expect(new Date(2027, 0, 1).getDate()).toBe(1);
		expect(Date.UTC(2027, 0, 1)).toBe(RealDate.UTC(2027, 0, 1));
		expect(new Date()).toBeInstanceOf(RealDate);
		expect(new RealDate(0)).toBeInstanceOf(Date);
		expect(new Date().constructor).toBe(Date);
		expect(Object.prototype.toString.call(new Date())).toBe("[object Date]");

		undo.pop()!();
		expect(Date).toBe(RealDate);
		expect(new Date().constructor).toBe(RealDate);
		expect(Date.now() - before).toBeLessThan(1000);
	});

	test("moves Temporal.Now", () => {
		const before = Temporal.Now.instant();
		undo.push(shiftClock(YEAR));
		const moved = Temporal.Now.instant().since(before).total("milliseconds");
		expect(moved).toBeGreaterThan(YEAR - 1);
		expect(moved).toBeLessThan(YEAR + 1000);
		const today = Temporal.Now.plainDateISO("UTC");
		expect(
			today.equals(
				before
					.add({ hours: 365 * 24 })
					.toZonedDateTimeISO("UTC")
					.toPlainDate(),
			),
		).toBe(true);
		expect(Temporal.Now.zonedDateTimeISO("Europe/Amsterdam").timeZoneId).toBe("Europe/Amsterdam");
		expect(Temporal.Now.plainDateTimeISO().toPlainDate().equals(Temporal.Now.plainDateISO())).toBe(
			true,
		);

		undo.pop()!();
		expect(Temporal.Now.instant().since(before).total("milliseconds")).toBeLessThan(1000);
	});

	test("moves SQLite's clock in the statements, and its defaults", () => {
		const offset = `'now', '+${YEAR / 1000} seconds'`;
		expect(shiftSql("select unixepoch(), date('now'), datetime( 'now' , 'localtime')", YEAR)).toBe(
			`select unixepoch(${offset}), date(${offset}), datetime( ${offset} , 'localtime')`,
		);
		expect(shiftSql("select unixepoch('subsecond'), julianday(), strftime('%s','now')", YEAR)).toBe(
			`select unixepoch(${offset}, 'subsecond'), julianday(${offset}), strftime('%s',${offset})`,
		);
		expect(shiftSql("create table t (at integer default (unixepoch()))", -1500)).toBe(
			"create table t (at integer default (unixepoch('now', '-1.5 seconds')))",
		);
		// Not a time value: left as it is.
		expect(shiftSql("select 'now' as word, unixepoch(at) from t", YEAR)).toBe(
			"select 'now' as word, unixepoch(at) from t",
		);
	});

	test("moves SQLite's clock in @libsql/client's statements, also in a transaction", async () => {
		const client = createClient({ url: ":memory:" });
		const now = async () => Number((await client.execute("select unixepoch()")).rows[0][0]);
		const before = await now();
		undo.push(await shiftLibsql(YEAR));
		expect((await now()) - before).toBeGreaterThanOrEqual(YEAR / 1000);
		expect((await now()) - before).toBeLessThan(YEAR / 1000 + 2);
		const [batched] = await client.batch([{ sql: "select unixepoch()", args: [] }]);
		expect(Number(batched.rows[0][0]) - before).toBeGreaterThanOrEqual(YEAR / 1000);
		const transaction = await client.transaction("read");
		const inside = await transaction.execute("select date('now')");
		await transaction.rollback();
		expect(inside.rows[0][0]).toBe(new Date(Date.now() + YEAR).toISOString().slice(0, 10));

		undo.pop()!();
		expect((await now()) - before).toBeLessThan(2);
		client.close();
	});
});

// The tables these make in a `TEST_NOW` run have their defaults moved already, as they're made.
describe.skipIf(process.env.TEST_NOW)("a test database's unixepoch() defaults", () => {
	const ddl =
		"create table t (id integer, at integer not null default (unixepoch()), ms integer default (cast(unixepoch('subsecond') * 1000 as integer)))";

	test("stay as they are without TEST_NOW", async () => {
		const file = await database(ddl);
		await shiftSchemaDefaults(file.url, {});
		expect(await file.schema()).toBe(ddl.replace("create table", "CREATE TABLE"));
		file.remove();
	});

	test("run at TEST_NOW", async () => {
		const file = await database(ddl);
		const env = { TEST_NOW: "2030-06-15T12:00:00Z" };
		await shiftSchemaDefaults(file.url, env);
		// Once only.
		await shiftSchemaDefaults(file.url, env);
		expect((await file.schema()).match(/'now', '\+/g)).toHaveLength(2);

		const client = createClient({ url: file.url });
		await client.execute("insert into t (id) values (1)");
		const [row] = (await client.execute("select at, ms from t")).rows;
		client.close();
		const expected = Date.UTC(2030, 5, 15, 12) / 1000;
		expect(Math.abs(Number(row.at) - expected)).toBeLessThan(60);
		expect(Math.abs(Number(row.ms) / 1000 - expected)).toBeLessThan(60);
		file.remove();
	});
});

test.skipIf(process.env.TEST_NOW)(
	"installing it moves this process's clocks, and the processes it starts load it",
	async () => {
		const env: Record<string, string | undefined> = { TEST_NOW: "2030-06-15T12:00:00Z" };
		const undoInstall = (await installTestClock(env))!;
		undo.push(undoInstall);
		expect(Math.abs(Date.now() - Date.UTC(2030, 5, 15, 12))).toBeLessThan(60_000);
		expect(env.NODE_OPTIONS).toMatch(/^--import=file:\/\/.*\/src\/tests\/clock\/register\.ts$/);
		// Once per process.
		expect(await installTestClock(env)).toBeUndefined();

		undo.pop()!();
		expect(Math.abs(Date.now() - Date.UTC(2030, 5, 15, 12))).toBeGreaterThan(60_000);
		expect(env.NODE_OPTIONS).toBeUndefined();
	},
);

/** A database file with the table `ddl` makes, its URL, its schema and what removes it. */
async function database(ddl: string) {
	const folder = mkdtempSync(join(tmpdir(), "fieldworks-clock-"));
	const url = `file:${join(folder, "test.db")}`;
	const client = createClient({ url });
	await client.execute(ddl);
	client.close();
	return {
		url,
		async schema() {
			const reader = createClient({ url });
			const [row] = (await reader.execute("select sql from sqlite_master where name = 't'")).rows;
			reader.close();
			return row.sql as string;
		},
		remove: () => rmSync(folder, { recursive: true, force: true }),
	};
}
