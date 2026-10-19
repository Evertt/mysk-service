/**
 * What a browser reports of an error (`reportClientError`): logged as one structured line beside
 * the server's own, by anyone, within its limits, with who reported it taken from the session.
 */
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { reportClientError } from "#lib/errors/report.remote.ts";
import { REPORTS_PER_MINUTE } from "#lib/server/logs/reports.ts";
import {
	as,
	call,
	north,
	organizationId,
	signedOut,
	south,
} from "#unit/lib/server/harness/index.ts";

const logged = vi.spyOn(console, "error");

beforeEach(() => logged.mockImplementation(() => {}));
afterEach(() => logged.mockReset());

/** The client error lines logged, parsed. */
const lines = () =>
	logged.mock.calls
		.map(([first]) =>
			typeof first === "string" && first.startsWith("{") ? JSON.parse(first) : null,
		)
		.filter((line) => line?.side === "client");

let next = 0;
/** A report as the browser sends it, with an error id of its own. */
const reportOf = (fields: Record<string, unknown> = {}) => ({
	errorId: `error-${++next}`,
	kind: "unknown",
	message: "Cannot read properties of undefined (reading 'name')",
	stack: "TypeError: Cannot read properties of undefined\n    at page.svelte:12:3",
	route: "/(app)/orders/[number]",
	path: "/orders/ORD-2026-00001?tab=lines#notes",
	version: "1792400000000",
	userAgent: "Mozilla/5.0",
	source: "boundary:part:gadgets/orders.detail.side/card",
	...fields,
});

test("a report is logged as a client error, with the user and tenant of the session", async () => {
	const report = reportOf();
	expect(await as(north.member, () => call(reportClientError, report))).toMatchObject({
		status: 200,
	});

	expect(lines()).toEqual([
		expect.objectContaining({
			type: "error",
			side: "client",
			errorId: report.errorId,
			kind: "unknown",
			message: report.message,
			stack: report.stack,
			route: report.route,
			// The path only, without what the query or hash held.
			path: "/orders/ORD-2026-00001",
			version: "1792400000000",
			source: report.source,
			organizationId: organizationId("north"),
			userId: expect.any(String),
		}),
	]);
});

test("who reported it comes from the session, never from the report", async () => {
	const report = { ...reportOf(), organizationId: organizationId("south"), userId: "someone" };
	await as(north.member, () => call(reportClientError, report as never));

	expect(lines()).toHaveLength(1);
	expect(lines()[0].organizationId).toBe(organizationId("north"));
	expect(lines()[0].userId).not.toBe("someone");
});

test("signed out, a report is logged too, without a user or tenant", async () => {
	expect(await signedOut(() => call(reportClientError, reportOf()))).toMatchObject({
		status: 200,
	});

	expect(lines()).toHaveLength(1);
	expect(lines()[0]).not.toHaveProperty("userId");
	expect(lines()[0]).not.toHaveProperty("organizationId");
});

test("a report over its limits, or of another kind, is refused and not logged", async () => {
	const tooLong = reportOf({ stack: "x".repeat(8_193) });
	const unknownKind = reportOf({ kind: "boom" });
	const noId = reportOf({ errorId: undefined });

	for (const report of [tooLong, unknownKind, noId]) {
		expect(await as(north.member, () => call(reportClientError, report as never))).toMatchObject({
			status: 400,
		});
	}
	expect(lines()).toEqual([]);
});

test("an error is logged once, whoever reports it again", async () => {
	const report = reportOf();
	await as(north.owner, () => call(reportClientError, report));
	await as(north.owner, () => call(reportClientError, report));
	await as(south.owner, () => call(reportClientError, report));

	expect(lines()).toHaveLength(1);
});

test(`a session's reports past ${REPORTS_PER_MINUTE} a minute are dropped; another's aren't`, async () => {
	await as(south.member, async () => {
		for (let i = 0; i < REPORTS_PER_MINUTE + 5; i++) {
			expect(await call(reportClientError, reportOf())).toMatchObject({ status: 200 });
		}
	});
	expect(lines()).toHaveLength(REPORTS_PER_MINUTE);

	await as(south.engineer, () => call(reportClientError, reportOf()));
	expect(lines()).toHaveLength(REPORTS_PER_MINUTE + 1);
});
