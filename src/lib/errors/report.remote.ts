import { getRequestEvent } from "$app/server";
import * as v from "valibot";

import { logLine } from "#lib/server/logs/log.ts";
import { admitReport } from "#lib/server/logs/reports.ts";
import { forAnyone } from "#lib/server/remote-functions.ts";

import { errorKinds } from "./classify.ts";

/** A string of at most `max` characters. */
const text = (max: number) => v.pipe(v.string(), v.maxLength(max));

/** What a browser sends of an error it caught (see `report()` in `report.ts`). */
const clientError = v.object({
	errorId: text(64),
	kind: v.picklist(errorKinds),
	message: text(2_000),
	stack: v.optional(text(8_192)),
	route: v.nullable(text(500)),
	path: text(2_000),
	version: text(100),
	userAgent: text(500),
	/** Where it was caught: `boundary:<name>`, `hook`, `error` or `unhandledrejection`. */
	source: text(200),
});

/**
 * Logs an error a browser caught as one structured line (`side: "client"`), like the server's own
 * (`handleError`), so both are found in the logs by their error id. Anyone may report, also signed
 * out: a page that failed may well be the login page. Who reported it (the user and tenant) comes
 * from the session, never from the report. Within limits (`admitReport()`): what's over them is
 * dropped without a word, as the browser drops a report it couldn't send.
 */
export const reportClientError = forAnyone.command(clientError, (report) => {
	const event = getRequestEvent();
	const { session, user, tenant } = event.locals;
	if (!admitReport(session?.id ?? event.getClientAddress(), report.errorId)) return;
	logLine({
		type: "error",
		side: "client",
		...report,
		// The path only, as the server logs it: a query may hold what was searched for.
		path: report.path.split(/[?#]/)[0],
		userId: user?.id,
		organizationId: tenant?.organizationId,
	});
});
