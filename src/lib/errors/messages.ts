import { m } from "#lib/paraglide/messages.js";

import { type ErrorKind, statusOf } from "./classify.ts";

/** SvelteKit's own messages, which say less than ours: an unknown error's, an unmatched URL's. */
const generic = new Set(["Internal Error", "Not Found"]);

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
			if (status === 403) {
				return { title: m.common_error_no_access(), text: m.common_error_no_access_description() };
			}
			// A refusal's message is the app's own, in the user's language (`error(404, m.…())`).
			const message =
				typeof error === "object" && error !== null && "message" in error
					? String(error.message)
					: "";
			const own = message && !generic.has(message) ? message : undefined;
			return status === 404
				? { title: m.common_error_not_found(), text: own ?? m.common_error_gone() }
				: { title: m.common_error_generic(), text: own ?? m.common_error_unexpected() };
		}
	}
}
