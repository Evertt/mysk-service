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
