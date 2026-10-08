/*
 * Classes the data table's cells and rows share (see `data-table.svelte` and `group-row.svelte`).
 */

// Sticky cells are opaque: the table's surface (`--data-table-surface`, the background behind
// the table) under the row's own background, which they inherit, and which `::before` paints
// again on top of that surface. That keeps hover, selection and theme colours intact. A theme
// that gives the table a background of its own sets the surface to match, e.g.
// `[--data-table-surface:var(--card)]` on `data-table`.
export const opaque =
	"bg-inherit bg-[linear-gradient(var(--data-table-surface),var(--data-table-surface))] before:absolute before:inset-0 before:-z-10 before:bg-inherit";

// Compact rows (see `density.svelte.ts`): less padding in the cells and a lower header. The scroll
// area keeps a header's height clear at the top for rows scrolled into view (see
// `row-navigation.svelte.ts`).
export const compact = {
	head: "in-data-[table-density=compact]:h-8",
	cell: "in-data-[table-density=compact]:py-1",
	area: "*:data-[slot=table-container]:scroll-pt-10 in-data-[table-density=compact]:*:data-[slot=table-container]:scroll-pt-8",
};

// A focused row (see `row-navigation.svelte.ts`) has a ring drawn over its cells, pinned ones
// included, and under the sticky header (the row itself would paint its outline under them).
export const focusRing =
	"group/row relative outline-none after:pointer-events-none after:absolute after:inset-0 after:z-15 after:hidden after:ring-2 after:ring-ring after:ring-inset focus-visible:after:block";
