/**
 * What kind of error something thrown is, which decides what the user is told and whether a part
 * of the page tries again by itself (`error-boundary.svelte`, the `+error` pages):
 *
 * - `http`: a refusal with a 4xx status (a remote function's `error(404)` or `error(403)`). Shown
 *   by its status, never tried again by itself.
 * - `session`: a 401, the session is gone. Offers to sign in.
 * - `offline`: a failed `fetch` while the browser is offline. Tried again once it's back online.
 * - `updated`: a chunk of the app that didn't load (a new version replaced it), or any error once
 *   SvelteKit knows a new version is out. Offers to reload.
 * - `unknown`: anything else, e.g. the transient "Cannot read properties of undefined". Tried again
 *   once by itself (see `auto-reset.ts`).
 *
 * Errors reach a boundary as SvelteKit's `App.Error` (`{ status, message, errorId, kind }`, after
 * `handleError`), and the hooks see what was thrown, so `classify()` reads both. It never matches
 * the message of an `unknown` one: each browser words "undefined" differently.
 */
export const errorKinds = ["http", "session", "offline", "updated", "unknown"] as const;

export type ErrorKind = (typeof errorKinds)[number];

/** What `classify()` needs of the browser: whether it's online, and whether a new version is out. */
export interface ErrorContext {
	online?: boolean;
	updated?: boolean;
}

/**
 * The messages a failed dynamic import throws: Chrome's, Safari's and Firefox's ("error loading
 * dynamically imported module").
 */
const failedImport =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/** The HTTP status of a SvelteKit `HttpError`, an `App.Error`, or anything else that has one. */
export function statusOf(error: unknown): number | undefined {
	return isObject(error) && typeof error.status === "number" ? error.status : undefined;
}

/** The kind of `error` (see above); `context` defaults to an online browser of the latest version. */
export function classify(
	error: unknown,
	{ online = true, updated = false }: ErrorContext = {},
): ErrorKind {
	const status = statusOf(error);
	if (status === 401) return "session";
	if (status !== undefined && status >= 400 && status < 500) return "http";
	// An `App.Error` the client's `handleError` classified, when it still had the thrown error.
	if (isObject(error) && errorKinds.includes(error.kind as ErrorKind)) {
		return error.kind as ErrorKind;
	}
	if (error instanceof TypeError && !online) return "offline";
	const message = isObject(error) && typeof error.message === "string" ? error.message : "";
	if (failedImport.test(message) || updated) return "updated";
	return "unknown";
}
