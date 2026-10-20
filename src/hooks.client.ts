import { updated } from "$app/state";
import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";

import { classify } from "#lib/errors/classify.ts";
import { newErrorId, report } from "#lib/errors/report.ts";
import { stylesheetsLoaded } from "#lib/splash.ts";

/**
 * Before the app hydrates: its stylesheets, which no longer block the first paint so the splash
 * shows at once (`deferStylesheets()`, `src/lib/splash.ts`), must be in, so that it never runs
 * or is seen without them. And the errors nothing else catches (in an event handler, a timer, a
 * promise nobody awaits) are reported too (`#lib/errors/report.ts`).
 */
export const init: ClientInit = () => {
	addEventListener("error", (event) => report(event.error ?? event.message, { source: "error" }));
	addEventListener("unhandledrejection", (event) =>
		report(event.reason, { source: "unhandledrejection" }),
	);
	return stylesheetsLoaded();
};

/**
 * Every error SvelteKit catches in the browser (navigating, and rendering: a boundary gets what
 * this returns): its id and kind, decided while the thrown error is still at hand
 * (`classify()`), logged to the console and reported to the server. An `App.Error` from the server
 * (a remote function's) has its id already and doesn't come here.
 */
export const handleError: HandleClientError = ({ kind: caught, error }) => {
	const errorId = newErrorId();
	const kind = classify(error, { online: navigator.onLine, updated: updated.current });
	if (caught === "unknown") {
		console.error(error);
		report(error, { source: "hook", errorId, kind });
	}
	return { errorId, kind };
};
