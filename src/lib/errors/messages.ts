import { isHttpError } from "@sveltejs/kit";

import { m } from "#lib/paraglide/messages.js";

import { type ErrorKind, statusOf } from "./classify.ts";

/** SvelteKit's own messages, which say less than ours: an unknown error's, an unmatched URL's. */
const generic = new Set(["Internal Error", "Not Found", "Forbidden"]);

/**
 * The app's own message of a refusal, in the user's language: a 4xx `error(status, m.…())` as it
 * was thrown (an `HttpError`) or as a boundary gets it (an `App.Error`). It says more than ours. A
 * server's own failure (a 5xx: a handler that crashed, or a proxy's error page, whose message is its
 * status text, often empty), SvelteKit's own messages and anything else have none for the user.
 */
function ownMessage(error: unknown): string | undefined {
	const status = statusOf(error);
	if (status === undefined || status < 400 || status >= 500) return undefined;
	const message = isHttpError(error)
		? error.body.message
		: (error as { message?: unknown }).message;
	return typeof message === "string" && message && !generic.has(message) ? message : undefined;
}

/** What to tell the user about a failed call: its own message (see `ownMessage()`), else `fallback`. */
export function errorMessage(error: unknown, fallback: string) {
	return ownMessage(error) ?? fallback;
}

/** What to tell the user about an error of `kind` (see `classify()`): a title and a sentence. */
export function describeError(error: unknown, kind: ErrorKind) {
	switch (kind) {
		case "session":
			return { title: m.common_error_signed_out(), text: m.common_error_signed_out_description() };
		case "offline":
			return { title: m.common_error_offline(), text: m.common_error_offline_description() };
		case "updated":
			return { title: m.common_error_updated(), text: m.common_error_updated_description() };
		case "unknown":
			return { title: m.common_error_generic(), text: m.common_error_unknown_description() };
		case "http": {
			const status = statusOf(error);
			// E.g. a 403's "You're not a member of any organization".
			const own = ownMessage(error);
			if (status === 403) {
				return {
					title: m.common_error_no_access(),
					text: own ?? m.common_error_no_access_description(),
				};
			}
			return status === 404
				? { title: m.common_error_not_found(), text: own ?? m.common_error_gone() }
				: { title: m.common_error_generic(), text: own ?? m.common_error_unexpected() };
		}
	}
}
