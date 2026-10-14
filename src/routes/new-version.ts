/**
 * Loading a new deployment of the app in a tab that runs an older one, and saying so on the page
 * that loads: the root layout calls `takeNewVersion()` when SvelteKit has noticed one (`updated`),
 * and shows a notice where `tookNewVersion()` (`+layout.svelte`).
 */

const noteKey = "took-new-version";

/** Loads `href` afresh (or the page, without it), noting that it's for a new version. */
export function takeNewVersion(href?: string) {
	try {
		sessionStorage.setItem(noteKey, "1");
	} catch {
		// Without storage, the page just doesn't say why it loaded.
	}
	if (href) location.href = href;
	else location.reload();
}

/** Whether this page loaded for a new version; answers it once. */
export function tookNewVersion() {
	try {
		const took = sessionStorage.getItem(noteKey) !== null;
		sessionStorage.removeItem(noteKey);
		return took;
	} catch {
		return false;
	}
}
