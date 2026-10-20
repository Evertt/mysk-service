/**
 * Stand-ins for SvelteKit's `page`, `navigating` and `goto`, for component tests of tables that
 * keep their state in the URL:
 *
 * ```ts
 * vi.mock("$app/state", () => import("./fake-navigation.svelte.ts"));
 * vi.mock("$app/navigation", async () => ({ goto: (await import("./fake-navigation.svelte.ts")).goto }));
 * ```
 */

import type { TableMemory } from "#lib/components/data-table/table-memory.remote.ts";

export const page = $state({
	url: new URL("http://localhost/items"),
	route: { id: "/items" as string | null },
	data: {} as App.PageData,
	state: {} as App.PageState,
});

/** A navigation under way (`leaveFor()`), or none. */
export const navigating = $state({ to: null as { url: URL } | null });

/** The navigations `goto` made, oldest first. */
export const visits: { url: string; replace: boolean }[] = [];

export async function goto(url: string, options: { replace?: boolean } = {}) {
	visits.push({ url, replace: options.replace ?? false });
	page.url = new URL(url, page.url);
}

/**
 * Starts over at a URL, e.g. `/items?status=open`, as after a reload or a back navigation; with
 * `memory`, as a page whose load brings its table back (`loadTableMemory`) with that memory.
 */
export function visit(
	path: string,
	{ clear = true, memory }: { clear?: boolean; memory?: TableMemory | null } = {},
) {
	page.url = new URL(path, "http://localhost");
	navigating.to = null;
	page.data =
		memory === undefined
			? {}
			: { tableOwner: "org:user", tableMemory: { [page.route.id ?? ""]: memory } };
	if (clear) visits.length = 0;
}

/** The search of the last navigation, e.g. `?status=open`. */
export const lastSearch = () => new URL(visits.at(-1)?.url ?? "", page.url).search;

/** Starts a navigation to `path` that hasn't arrived yet, as a clicked link whose page loads. */
export function leaveFor(path: string) {
	navigating.to = { url: new URL(path, page.url) };
}
