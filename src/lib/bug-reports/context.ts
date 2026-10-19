/**
 * What the browser can say about the page when a recording starts: where, which version, the
 * screen, the language and time zone, the theme, and whether it's online. Who's recording, in which
 * organization and with which modules, the server adds when the report arrives (it knows, and
 * doesn't take the browser's word for it).
 */
import type { ClientContext } from "./report.ts";

/** The parts of the browser the context is read from (the real ones, unless a test passes its own). */
export interface Browser {
	innerWidth: number;
	innerHeight: number;
	devicePixelRatio: number;
	navigator: { userAgent: string; languages: readonly string[]; onLine: boolean };
	document: {
		documentElement: { dataset: DOMStringMap; classList: { contains(name: string): boolean } };
	};
}

/**
 * The context of a recording that starts on `page` (its URL and route id) of the app's `version`,
 * in `locale` and `timeZone` (the app's, `getLocale()` and `getTimeZone()`). The theme, mode and
 * tables' density are what `<html>` has (`app.html`, the theme provider and the density setting
 * keep them there).
 */
export function collectContext(
	page: { url: string; routeId: string | null },
	app: { version: string; locale: string; timeZone: string },
	browser: Browser = window,
): ClientContext {
	const root = browser.document.documentElement;
	return {
		url: page.url,
		routeId: page.routeId,
		version: app.version,
		viewport: {
			width: browser.innerWidth,
			height: browser.innerHeight,
			pixelRatio: browser.devicePixelRatio,
		},
		userAgent: browser.navigator.userAgent,
		locale: app.locale,
		languages: [...browser.navigator.languages],
		timeZone: app.timeZone,
		theme: root.dataset.theme ?? "",
		mode: root.dataset.mode ?? "",
		dark: root.classList.contains("dark"),
		density: root.dataset.tableDensity ?? "",
		online: browser.navigator.onLine,
	};
}
