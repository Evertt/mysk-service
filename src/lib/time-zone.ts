/**
 * The cookie the browser tells the server its time zone in: written by the root layout
 * (`keepTimeZone()`), read for each request by `handleTimeZone` (`src/lib/server/time-zone.ts`),
 * which runs the request in it. Both sides here, so the cookie's name and format are in one place.
 */
import type { Cookies } from "@sveltejs/kit";

import { isTimeZone, runtimeTimeZone } from "./dates.ts";

export const TIME_ZONE_COOKIE = "TIME_ZONE";

/** The time zone a request's cookies name, else the runtime's own (a first visit, or a bad one). */
export function timeZoneOf(cookies: Pick<Cookies, "get">) {
	const cookie = cookies.get(TIME_ZONE_COOKIE);
	return isTimeZone(cookie) ? cookie : runtimeTimeZone;
}

/** Once per tab, so a browser that keeps no cookies isn't reloaded over and over. */
const reloadedKey = "time-zone-reloaded";

/**
 * Tells the server the browser's time zone, for its next requests. If it rendered this page in
 * another zone (a first visit, or the user travelled), its days and times aren't the user's:
 * reloads it once, in theirs.
 */
export function keepTimeZone() {
	const root = document.documentElement;
	if (root.dataset.timeZone === runtimeTimeZone) return;
	const year = 60 * 60 * 24 * 365;
	document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(runtimeTimeZone)}; path=/; max-age=${year}; samesite=lax`;
	try {
		if (sessionStorage.getItem(reloadedKey)) return;
		sessionStorage.setItem(reloadedKey, "1");
	} catch {
		// No storage to remember the reload in: don't risk doing it again and again.
		return;
	}
	location.reload();
}
