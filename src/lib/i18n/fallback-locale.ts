/**
 * Dutch when nothing says which language someone wants: no chosen language (the cookie) and none of
 * the browser's languages is one the app has. The app's tenants are mainly Dutch. English stays the
 * base locale (the messages' source, and the language outside a request: scripts and unit tests).
 *
 * It's the `custom-dutch` strategy (`strategy` in `vite.config.ts`), between `preferredLanguage`
 * and `baseLocale`. Paraglide asks a custom strategy first on the server, whatever its place in the
 * order, so there it steps aside while the cookie or the browser's languages decide.
 */
import {
	cookieName,
	defineCustomClientStrategy,
	defineCustomServerStrategy,
	isLocale,
	type Locale,
} from "#lib/paraglide/runtime.js";

const fallback: Locale = "nl";

/** Whether the request names a language the app has: the cookie, or one of the browser's. */
function requestDecides(request: Request) {
	const cookies = request.headers.get("cookie") ?? "";
	const chosen = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`).exec(cookies)?.[1];
	if (chosen && isLocale(chosen)) return true;
	const accepted = request.headers.get("accept-language") ?? "";
	return accepted
		.split(",")
		.map((part) => part.split(";")[0].trim().split("-")[0].toLowerCase())
		.some((language) => isLocale(language));
}

/** Registers the strategy; call it once, in the hooks, before the first request. */
export function useDutchFallback() {
	defineCustomServerStrategy("custom-dutch", {
		getLocale: (request) => (request && requestDecides(request) ? undefined : fallback),
	});
	defineCustomClientStrategy("custom-dutch", {
		// In the browser it comes after the cookie and the browser's languages.
		getLocale: () => fallback,
		setLocale: () => {},
	});
}
