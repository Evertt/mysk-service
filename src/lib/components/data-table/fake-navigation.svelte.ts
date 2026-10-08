/**
 * Stand-ins for SvelteKit's `page` and `goto`, for component tests of tables that keep their
 * state in the URL:
 *
 * ```ts
 * vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
 * vi.mock("$app/navigation", async () => ({ goto: (await import("./fake-navigation.svelte.ts")).goto }));
 * ```
 */

export const page = $state({
	url: new URL("http://localhost/items"),
	route: { id: "/items" as string | null },
});

/** The navigations `goto` made, oldest first. */
export const visits: { url: string; replace: boolean }[] = [];

export async function goto(url: string, options: { replace?: boolean } = {}) {
	visits.push({ url, replace: options.replace ?? false });
	page.url = new URL(url, page.url);
}

/** Starts over at a URL, e.g. `/items?status=open`, as after a reload or a back navigation. */
export function visit(path: string, { clear = true } = {}) {
	page.url = new URL(path, "http://localhost");
	if (clear) visits.length = 0;
}

/** The search of the last navigation, e.g. `?status=open`. */
export const lastSearch = () => new URL(visits.at(-1)?.url ?? "", page.url).search;
