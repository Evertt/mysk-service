/**
 * The dashboard's two grids, shared with its skeleton (`../page-skeleton.svelte`) so the outline
 * shows the same columns.
 */
import { masonryGrid } from "#lib/components/masonry.ts";

/**
 * The headline numbers: as many tiles a row as fit at 11rem or wider, the tiles there are filling
 * the row (`auto-fit`), so four tiles (a tenant without materials) don't leave a fifth's gap.
 */
export const statGrid = "grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]";

/**
 * The cards (a masonry, see `#lib/components/masonry.ts`): columns at least 20rem wide (a card's
 * table of four columns still fits), three at most, so one on a phone and next to the sidebar on
 * a tablet, two on a laptop and three on a wide screen. `auto-fill` keeps the empty columns, so a
 * card is as wide whether there are two cards or ten.
 */
export const cardGrid = `${masonryGrid} gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,max(20rem,calc((100%_-_3rem)/3))),1fr))]`;
