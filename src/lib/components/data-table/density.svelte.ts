/**
 * How tightly the data tables' rows are spaced: one setting for every table, remembered per
 * browser in a cookie. The server renders it into `<html data-table-density>` (`hooks.server.ts`),
 * so the first paint is right, and the tables style themselves from that attribute (the
 * `in-data-[table-density=compact]:` classes in `data-table.svelte`).
 */

export const densities = ["comfortable", "compact"] as const;

export type Density = (typeof densities)[number];

export const DENSITY_COOKIE = "table-density";

/** The density stored in the cookie (or the attribute), falling back to `comfortable`. */
export const parseDensity = (value: string | null | undefined): Density =>
	densities.find((density) => density === value) ?? "comfortable";

const root = () => (typeof document === "undefined" ? undefined : document.documentElement);

// Only ever changed in the browser, so the server's copy stays at the default (and nothing it
// renders reads it: the tables use the attribute, the view menu renders when it opens).
let current = $state<Density>(parseDensity(root()?.dataset.tableDensity));

/** The tables' density in this browser; setting it restyles every table and remembers it. */
export const tableDensity = {
	get current() {
		return current;
	},
	set current(density: Density) {
		current = density;
		const html = root();
		if (!html) return;
		html.dataset.tableDensity = density;
		// A year, like the theme and mode cookies; set here, as no server code needs to run for it.
		document.cookie = `${DENSITY_COOKIE}=${density}; path=/; max-age=31536000; samesite=lax`;
	},
};
