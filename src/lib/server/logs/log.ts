/**
 * The app's structured log lines: one JSON object per line on the console, which Cloudflare's
 * Workers Logs indexes by field (`errorId = "…"` finds an error; see "Reading the logs" in
 * README.md), and which stays readable in a terminal on Node.
 *
 * - `type: "error"`: an error the server caught (`handleError` in `hooks.server.ts`, `side:
 *   "server"`) or one a browser reported (`reportClientError`, `side: "client"`).
 * - `type: "timing"`: how long a request, and the database's transactions in it, took
 *   (`#lib/server/timing.ts`), with `TIMING_LOGS=1`.
 */
import { version } from "$app/env";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Writes `line` as one JSON line, with the app's version unless it has one (a browser's report says
 * which version it ran): errors to `console.error`, the rest to `console.log`.
 */
export function logLine(line: { type: "error" | "timing" } & Record<string, unknown>) {
	const text = JSON.stringify({ version, ...line });
	if (line.type === "error") console.error(text);
	else console.log(text);
}

/**
 * The remote function a request calls (`getOrder`), from its URL (`/_app/remote/<hash>/<name>`),
 * or `undefined` for any other request.
 */
function remoteName(event: Pick<RequestEvent, "request" | "isRemoteRequest">) {
	if (!event.isRemoteRequest) return undefined;
	const { pathname } = new URL(event.request.url);
	return pathname.split("/remote/")[1]?.split("/")[1];
}

/** What `read` answers, or `undefined` if it throws. */
function readable<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}

/**
 * Where a request was and who made it, for its log lines: its route, its page's path (no query,
 * which may hold what was searched for), the remote function it calls, and the user and tenant of
 * its session. Inside a remote function SvelteKit refuses to read the route and the page's URL
 * (`remote_request_property`), so there they're left out.
 */
export function requestFields(event: RequestEvent) {
	return {
		route: readable(() => event.route.id),
		url: readable(() => event.url.pathname),
		remote: remoteName(event),
		userId: event.locals.user?.id,
		organizationId: event.locals.tenant?.organizationId,
	};
}

/**
 * What `error` was caused by, outermost first: each cause's message, and the database's code where
 * it has one (`SQLITE_BUSY`; drizzle's "Failed query" error has the driver's error as its cause).
 * `undefined` without a cause.
 */
function causesOf(error: unknown) {
	const causes: { message: string; code?: string }[] = [];
	const seen = new Set<unknown>([error]);
	let cause = error instanceof Error ? error.cause : undefined;
	while (cause !== undefined && !seen.has(cause)) {
		seen.add(cause);
		if (!(cause instanceof Error)) {
			const text = typeof cause === "string" ? cause : readable(() => JSON.stringify(cause));
			causes.push({ message: text ?? typeof cause });
			break;
		}
		const { code, extendedCode } = cause as { code?: unknown; extendedCode?: unknown };
		const sqlite = [extendedCode, code].find((value) => typeof value === "string");
		causes.push(sqlite ? { message: cause.message, code: sqlite } : { message: cause.message });
		cause = cause.cause;
	}
	return causes.length ? causes : undefined;
}

/** Logs an error the server caught, with its id and its causes (see `handleError`). */
export function logServerError(
	event: RequestEvent,
	{ errorId, status, error }: { errorId: string; status: number; error: unknown },
) {
	logLine({
		type: "error",
		side: "server",
		errorId,
		status,
		message: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		causes: causesOf(error),
		...requestFields(event),
	});
}
