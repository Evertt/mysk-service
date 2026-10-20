/**
 * Ends the splash screen of a full page load (`app.html`) once the app is interactive: the root
 * layout calls this when it mounts, right after it sets `data-hydrated`, which fades the splash out
 * (and stops it catching clicks) by CSS. This takes the page's busy state off and removes the
 * splash once it has faded. Client-side navigations have no splash: it's gone by then.
 */
export function dismissSplash() {
	document.getElementById("app")?.removeAttribute("aria-busy");
	const splash = document.getElementById("splash");
	if (splash) setTimeout(() => splash.remove(), 300);
}

/**
 * The page's stylesheets as the server renders them, made not to block the first paint: a
 * stylesheet in the head holds every paint until it has downloaded, the splash's too, and on a
 * slow connection the app's (large, and sharing the line with its scripts) took seconds. Each is
 * preloaded instead, and becomes a stylesheet once it's in; `stylesheetsLoaded()` holds the app's
 * start until then, so the page is never seen, or hydrated, without them (the splash covers it
 * meanwhile). Without JavaScript they're plain stylesheets (`<noscript>`). For `hooks.server.ts`'s
 * `transformPageChunk`; a dev server's styles come in otherwise and are left alone.
 */
export const deferStylesheets = (html: string) =>
	html.replace(
		/<link href="([^"]+)" rel="stylesheet">/g,
		(_, href: string) =>
			`<link href="${href}" rel="preload" as="style" data-splash-style ` +
			`onload="this.onload=null;this.rel='stylesheet'" onerror="this.dataset.failed=''">` +
			`<noscript><link href="${href}" rel="stylesheet"></noscript>`,
	);

/**
 * Resolves once the stylesheets `deferStylesheets()` made preloads are applied (or failed to
 * load), or after `timeout` ms whatever their state: `hooks.client.ts`'s `init`, which SvelteKit
 * awaits before it hydrates the page.
 */
export function stylesheetsLoaded(timeout = 15_000) {
	const links = [...document.querySelectorAll<HTMLLinkElement>("link[data-splash-style]")];
	const ready = () =>
		links.every((link) => (link.rel === "stylesheet" && link.sheet) || "failed" in link.dataset);
	return new Promise<void>((resolve) => {
		const giveUp = performance.now() + timeout;
		const check = () => {
			if (ready() || performance.now() > giveUp) resolve();
			else requestAnimationFrame(check);
		};
		check();
	});
}
