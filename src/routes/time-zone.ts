import { runtimeTimeZone, TIME_ZONE_COOKIE } from "#lib/dates.ts";

/** Once per tab, so a browser that keeps no cookies isn't reloaded over and over. */
const reloadedKey = "time-zone-reloaded";

/**
 * Tells the server the browser's time zone (in `TIME_ZONE_COOKIE`, see
 * `src/lib/server/time-zone.ts`), for its next requests. If it rendered this page in another zone
 * (a first visit, or the user travelled), its days and times aren't the user's: reloads it once,
 * in theirs.
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
