import { LibsqlError } from "@libsql/client";
import type { RequestEvent } from "@sveltejs/kit";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { logServerError } from "#lib/server/logs/log.ts";

vi.mock("$app/env", () => ({ version: "test" }));

afterEach(() => {
	vi.restoreAllMocks();
});

const event = { isRemoteRequest: false, locals: {}, route: { id: "/" }, url: new URL("http://x/") };

/** What `logServerError()` writes for `error`, parsed. */
function logged(error: unknown) {
	const write = vi.spyOn(console, "error").mockImplementation(() => {});
	logServerError(event as unknown as RequestEvent, { errorId: "e1", status: 500, error });
	return JSON.parse(String(write.mock.lastCall?.[0]));
}

test("an error's causes are logged, with SQLite's code where they have one", () => {
	// What drizzle throws: its "Failed query" error, with the driver's error as the cause.
	const driver = new LibsqlError(
		"database is locked",
		"SQLITE_BUSY",
		"SQLITE_BUSY_SNAPSHOT",
		517,
		new Error("the lock"),
	);
	const line = logged(new Error("Failed query: select 1", { cause: driver }));

	expect(line).toMatchObject({ message: "Failed query: select 1", status: 500, errorId: "e1" });
	expect(line.causes).toEqual([
		{ message: "SQLITE_BUSY: database is locked", code: "SQLITE_BUSY_SNAPSHOT" },
		{ message: "the lock" },
	]);
});

test("an error without a cause has none, and a cause that isn't an error is its text", () => {
	expect(logged(new Error("plain")).causes).toBeUndefined();
	expect(logged(new Error("odd", { cause: "a string" })).causes).toEqual([{ message: "a string" }]);
	expect(logged(new Error("odd", { cause: { status: 3 } })).causes).toEqual([
		{ message: `{"status":3}` },
	]);
});

test("a cause that leads back to itself is logged once", () => {
	const error = new Error("outer");
	const inner = new Error("inner", { cause: error });
	error.cause = inner;
	expect(logged(error).causes).toEqual([{ message: "inner" }]);
});
