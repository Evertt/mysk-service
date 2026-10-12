/**
 * The user's time zone on the server, for each request: the one their browser keeps in a cookie
 * (`TIME_ZONE_COOKIE`, set by the root layout), else the server's own. `getTimeZone()`
 * (`#lib/dates.ts`) answers with it while the request runs, like Paraglide's `getLocale()`, so
 * the days the server works out ("today", a date range's days, a form's date) and the dates it
 * renders are the ones the user sees in the browser.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { Handle } from "@sveltejs/kit/hooks";

import { isTimeZone, overwriteGetTimeZone, runtimeTimeZone, TIME_ZONE_COOKIE } from "#lib/dates.ts";

const requestTimeZone = new AsyncLocalStorage<string>();

overwriteGetTimeZone(() => requestTimeZone.getStore() ?? runtimeTimeZone);

/**
 * Runs the request in the time zone its cookie names, and tells the page which it rendered in
 * (`data-time-zone` on `<html>`), so the browser can tell when that wasn't its own.
 */
export const handleTimeZone: Handle = ({ event, resolve }) => {
	const cookie = event.cookies.get(TIME_ZONE_COOKIE);
	const timeZone = isTimeZone(cookie) ? cookie : runtimeTimeZone;
	return requestTimeZone.run(timeZone, () =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace("%time-zone%", timeZone),
		}),
	);
};
