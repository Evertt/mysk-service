/**
 * The test clock: runs the tests, the seed and the app under test at another moment than now, to
 * find what breaks on certain dates (a weekend, a month's end, 1 January, a clock change). Set
 * `TEST_NOW` and every clock moves by the same offset, and keeps running from there:
 *
 * - `TEST_NOW=2027-01-01`: that day, at this moment's time of day;
 * - `TEST_NOW=2027-01-01T07:45` (or `…T07:45:30`): that time on that day;
 * - `TEST_NOW=2027-01-01T06:45Z` (or with an offset, `…+01:00`): that instant.
 *
 * A day and a time are in the time zone the tests run in (the machine's, or `TZ`'s), which is the
 * app's: its server and the test browsers take it from there.
 *
 * What moves: `Date` and `Temporal.Now` in each Node process (`installTestClock()`, which the
 * global setups and the Node projects' setup file call, and which loads itself into each Node
 * process started after it through `NODE_OPTIONS`: the seed, the build, the app's servers), SQLite's
 * clock in the statements sent through `@libsql/client` and in a test database's column defaults
 * (`shiftSchemaDefaults()`), and `Date` and `Temporal.Now` in the e2e tests' browser contexts
 * (`clockContext()`). Without `TEST_NOW` none of it is touched.
 */
import { pathToFileURL } from "node:url";

import type { BrowserContext } from "playwright";
import { Temporal as Polyfill } from "temporal-polyfill";

/** Where the first process to read `TEST_NOW` notes its offset (ms) for the ones it starts. */
const OFFSET = "TEST_NOW_OFFSET_MS";

type Env = Record<string, string | undefined>;

/**
 * The instant `value` (a `TEST_NOW`) names, read in `timeZone` at the real moment `now`. Throws
 * for a value that is none of the forms above.
 */
export function parseTestNow(
	value: string,
	timeZone: string,
	now: number = realNow(),
): Polyfill.Instant {
	const text = value.trim();
	try {
		if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
			const time = Polyfill.Instant.fromEpochMilliseconds(now)
				.toZonedDateTimeISO(timeZone)
				.toPlainTime();
			return Polyfill.PlainDate.from(text)
				.toZonedDateTime({ timeZone, plainTime: time })
				.toInstant();
		}
		if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return Polyfill.Instant.from(text);
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
			return Polyfill.PlainDateTime.from(text).toZonedDateTime(timeZone).toInstant();
		}
	} catch {
		// Said below.
	}
	throw new Error(
		`TEST_NOW=${value} is not a day (2027-01-01), a time on a day (2027-01-01T07:45) or an instant (2027-01-01T06:45Z).`,
	);
}

/**
 * How far `TEST_NOW` moves the clock, in milliseconds, or `undefined` without it. The first process
 * that reads it notes the offset in `env`, so the processes it starts later move by the same and
 * the clock runs on across them, rather than each starting at `TEST_NOW` again.
 */
export function testNowOffset(env: Env = process.env): number | undefined {
	if (!env.TEST_NOW) return undefined;
	const noted = Number(env[OFFSET]);
	if (env[OFFSET] && Number.isFinite(noted)) return noted;
	const now = realNow();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const offset = parseTestNow(env.TEST_NOW, timeZone, now).epochMilliseconds - now;
	env[OFFSET] = String(offset);
	return offset;
}

/** Where `shiftClock()` keeps the real `Date` on the global. */
const realDate = Symbol.for("fieldworks.test-clock.real-date");

/** The real time, also once this process's clock is moved. */
const realNow = () =>
	(globalThis as { [realDate]?: DateConstructor })[realDate]?.now() ?? Date.now();

/**
 * Moves `Date` and `Temporal.Now` of `scope` (this realm's global by default) `offset` ms on; returns
 * what undoes it. Also the script each test browser context runs before a page's own
 * (`clockContext()`), so it uses nothing from outside itself. Not Playwright's `page.clock`, whose
 * fake timers change how the pages run; a `Temporal` installed later (the polyfill) reads `Date.now()`.
 */
export function shiftClock(offset: number, scope: typeof globalThis = globalThis): () => void {
	const RealDate = scope.Date;
	const now = () => RealDate.now() + offset;
	// `new Date()` and `Date.now()` are moved; `new Date(x)`, `instanceof Date`, its statics and
	// prototype stay the real `Date`'s.
	const ShiftedDate = new Proxy(RealDate, {
		construct: (target, args, newTarget) =>
			Reflect.construct(target, args.length ? args : [now()], newTarget),
		apply: () => new RealDate(now()).toString(),
		get: (target, key, receiver) => (key === "now" ? now : Reflect.get(target, key, receiver)),
	});
	scope.Date = ShiftedDate;
	RealDate.prototype.constructor = ShiftedDate;
	// The real `Date`, for `realNow()`: kept by the first of shifts on top of each other.
	const real = Symbol.for("fieldworks.test-clock.real-date");
	const first = !(real in scope);
	if (first) Object.defineProperty(scope, real, { value: RealDate, configurable: true });

	const Now = scope.Temporal?.Now as Record<string, unknown> | undefined;
	const saved = new Map<string, PropertyDescriptor | undefined>();
	if (Now) {
		const { Instant } = scope.Temporal;
		const zoneOf = (Now.timeZoneId as () => string).bind(Now);
		const zoned = (zone?: string) =>
			Instant.fromEpochMilliseconds(now()).toZonedDateTimeISO(zone ?? zoneOf());
		const moved: Record<string, unknown> = {
			instant: () => Instant.fromEpochMilliseconds(now()),
			zonedDateTimeISO: zoned,
			plainDateTimeISO: (zone?: string) => zoned(zone).toPlainDateTime(),
			plainDateISO: (zone?: string) => zoned(zone).toPlainDate(),
			plainTimeISO: (zone?: string) => zoned(zone).toPlainTime(),
		};
		for (const [name, value] of Object.entries(moved)) {
			saved.set(name, Object.getOwnPropertyDescriptor(Now, name));
			Object.defineProperty(Now, name, { value, configurable: true, writable: true });
		}
	}

	return () => {
		scope.Date = RealDate;
		RealDate.prototype.constructor = RealDate;
		if (first) delete (scope as Record<symbol, unknown>)[real];
		for (const [name, descriptor] of saved) {
			if (descriptor) Object.defineProperty(Now, name, descriptor);
			else delete Now![name];
		}
	};
}

/** SQLite's modifier that moves a time `offset` ms on, e.g. `'+31536000.5 seconds'`. */
const modifier = (offset: number) =>
	`'${offset < 0 ? "-" : "+"}${Math.abs(offset) / 1000} seconds'`;

/**
 * `sql` with SQLite's clock moved `offset` ms on: `'now'` as a date function's time value
 * (`date('now')`, `datetime('now', 'localtime')`, `strftime('%s', 'now')`), and the functions that
 * default to it (`unixepoch()`, `unixepoch('subsecond')`, `datetime()`, …). Still SQLite's clock,
 * so it runs on, also in a column's default.
 */
export function shiftSql(sql: string, offset: number) {
	const now = `'now', ${modifier(offset)}`;
	return sql
		.replace(/([(,]\s*)'now'(?=\s*[),])/gi, `$1${now}`)
		.replace(/\b(unixepoch|date|time|datetime|julianday)\(\s*\)/gi, `$1(${now})`)
		.replace(/\bunixepoch\(\s*'subsecond'\s*\)/gi, `unixepoch(${now}, 'subsecond')`);
}

/** A column default `shiftSql()` moved already. */
const shifted = /'now',\s*'[+-]\d/;

/**
 * Moves SQLite's clock in `@libsql/client`'s statements (its `node` and `file:` clients' `execute`,
 * `batch`, `executeMultiple` and `migrate`, also in a transaction); returns what undoes it.
 */
export async function shiftLibsql(offset: number): Promise<() => void> {
	const { Sqlite3Client, Sqlite3Transaction } = await import("@libsql/client/sqlite3");
	const shift = (statement: unknown): unknown => {
		if (typeof statement === "string") return shiftSql(statement, offset);
		if (Array.isArray(statement)) return [shift(statement[0]), ...statement.slice(1)];
		if (statement && typeof (statement as { sql: unknown }).sql === "string") {
			const { sql } = statement as { sql: string };
			return { ...statement, sql: shiftSql(sql, offset) };
		}
		return statement;
	};
	const restore: (() => void)[] = [];
	const wrap = (prototype: object, name: string, change: (first: unknown) => unknown) => {
		const methods = prototype as Record<string, (first: unknown, ...rest: unknown[]) => unknown>;
		const original = methods[name];
		if (!original) return;
		methods[name] = function (this: unknown, first, ...rest) {
			return original.call(this, change(first), ...rest);
		};
		restore.push(() => (methods[name] = original));
	};
	const all = (statements: unknown) => (statements as unknown[]).map(shift);
	for (const prototype of [Sqlite3Client.prototype, Sqlite3Transaction.prototype]) {
		wrap(prototype, "execute", shift);
		wrap(prototype, "batch", all);
		wrap(prototype, "executeMultiple", shift);
		wrap(prototype, "migrate", all);
	}
	return () => restore.forEach((undo) => undo());
}

/** Set on the global once `installTestClock()` moved this process's clock. */
const installed = Symbol.for("fieldworks.test-clock.installed");

/**
 * Moves this process's clocks to `TEST_NOW` (`Date`, `Temporal.Now` and `@libsql/client`'s SQLite),
 * and has each Node process it starts from then on do the same (`NODE_OPTIONS`); once per process.
 * Returns what undoes it, or `undefined` without `TEST_NOW` (or done already).
 */
export async function installTestClock(env: Env = process.env) {
	const offset = testNowOffset(env);
	const scope = globalThis as { [installed]?: true };
	if (offset === undefined || scope[installed]) return undefined;
	scope[installed] = true;
	const undoClock = shiftClock(offset);
	const undoLibsql = await shiftLibsql(offset);
	const register = `--import=${pathToFileURL(`${import.meta.dirname}/register.ts`).href}`;
	const options = env.NODE_OPTIONS ?? "";
	if (!options.includes(register)) env.NODE_OPTIONS = `${options} ${register}`.trim();
	return () => {
		undoLibsql();
		undoClock();
		env.NODE_OPTIONS = options || undefined;
		delete scope[installed];
	};
}

/**
 * Moves the `unixepoch()` column defaults of the database at `url` (a `file:` URL) to `TEST_NOW`,
 * for the rows a statement inserts without them; nothing without `TEST_NOW`. For a test database
 * just migrated: it rewrites the schema (`writable_schema`), which the connections opened after it
 * read.
 */
export async function shiftSchemaDefaults(url: string, env: Env = process.env) {
	const offset = testNowOffset(env);
	if (offset === undefined) return;
	const { createClient } = await import("@libsql/client");
	const client = createClient({ url });
	try {
		const tables = await client.execute(
			"select name, sql from sqlite_master where type = 'table' and sql like '%unixepoch(%'",
		);
		const changes = (tables.rows as unknown as { name: string; sql: string }[])
			.filter(({ sql }) => !shifted.test(sql))
			.map(({ name, sql }) => ({ name, moved: shiftSql(sql, offset), sql }))
			.filter(({ moved, sql }) => moved !== sql);
		if (!changes.length) return;
		await client.execute("pragma writable_schema = on");
		for (const { name, moved } of changes) {
			await client.execute({
				sql: "update sqlite_master set sql = ? where type = 'table' and name = ?",
				args: [moved, name],
			});
		}
		await client.execute("pragma writable_schema = off");
	} finally {
		client.close();
	}
}

/** Moves `Date` and `Temporal.Now` in the pages of a browser `context` to `TEST_NOW`, if set. */
export async function clockContext(context: BrowserContext, env: Env = process.env) {
	const offset = testNowOffset(env);
	if (offset !== undefined) await context.addInitScript(shiftClock, offset);
}
