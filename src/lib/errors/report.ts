/**
 * Sends the errors the browser catches to the server (`reportClientError`), which logs them beside
 * its own, so an error in someone's browser is found in the logs by the id they were shown.
 *
 * An error is often caught twice: SvelteKit runs the client's `handleError` hook first (which makes
 * its id and reports it from `hook`), and then a boundary gets it as an `App.Error` with that id.
 * So a report waits a moment, and a boundary's report of the same id names where it was caught
 * instead. An `App.Error` whose id this browser didn't make is the server's, which logged it
 * already. Each thrown object, and each id, is sent once; a report that fails to send is dropped,
 * never reported again. Only `unknown` errors are reported (see `classify.ts`): the other kinds
 * aren't bugs.
 */
import { version } from "$app/env";
import { page } from "$app/state";

import { classify, type ErrorKind } from "./classify.ts";
import { reportClientError } from "./report.remote.ts";

/** How long a report waits for a boundary to say where its error was caught. */
const REPORT_DELAY_MS = 100;

interface Report {
	errorId: string;
	kind: ErrorKind;
	message: string;
	stack?: string;
	source: string;
}

/** The reports waiting to be sent, by error id. */
const waiting = new Map<string, Report>();

/** The error ids this browser made: those it reported or is about to. */
const made = new Set<string>();

/** The thrown objects already reported. */
const reportedErrors = new WeakSet<object>();

/** A new error id. */
export const newErrorId = () => crypto.randomUUID();

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

function send(errorId: string) {
	const report = waiting.get(errorId);
	waiting.delete(errorId);
	if (!report || !navigator.onLine) return;
	reportClientError({
		...report,
		message: report.message.slice(0, 2_000),
		stack: report.stack?.slice(0, 8_192),
		route: page.route.id,
		path: location.pathname,
		version,
		userAgent: navigator.userAgent.slice(0, 500),
	}).catch(() => {});
}

/**
 * Reports `error`, caught at `source` (`hook`, `boundary:<name>`, `error`, `unhandledrejection`),
 * with its id and kind if they're known already (the hook's).
 */
export function report(
	error: unknown,
	{ source, errorId, kind }: { source: string; errorId?: string; kind?: ErrorKind },
) {
	if (isObject(error)) {
		if (reportedErrors.has(error)) return;
		reportedErrors.add(error);
	}
	const id = errorId ?? (isObject(error) && typeof error.errorId === "string" ? error.errorId : "");
	if (id) {
		const waits = waiting.get(id);
		// Caught again, by a boundary: says where.
		if (waits) {
			if (waits.source === "hook") waits.source = source;
			return;
		}
		// Sent already, or the server's (which logged it).
		if (!errorId) return;
	}
	const report: Report = {
		errorId: id || newErrorId(),
		kind: kind ?? classify(error, { online: navigator.onLine }),
		message: isObject(error) && typeof error.message === "string" ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		source,
	};
	// The other kinds are refusals the server made, or the browser's own state (offline, a new
	// version), not bugs.
	if (report.kind !== "unknown" || made.has(report.errorId)) return;
	made.add(report.errorId);
	waiting.set(report.errorId, report);
	setTimeout(() => send(report.errorId), REPORT_DELAY_MS);
}
