/**
 * A masonry: a page's cards, of different heights, packed into columns without the gaps a grid's
 * rows leave (the dashboard's, a unit's page).
 *
 * The container is a CSS grid with `masonryGrid`'s classes, whose columns the page's own classes
 * decide; this only places the cards in them: each, in the page's order, under the column that's shortest so far,
 * so the cards read roughly left to right, row by row, and the DOM order (what a keyboard and a
 * screen reader follow) stays the page's. In masonry mode (`data-masonry`) the grid's rows are 1px
 * each, and a card spans as many as it's tall. Until the script runs, and with one column, it's
 * a plain grid.
 *
 * A wide card (`data-wide`, on the card or on an element around it) spans two columns where there
 * are two or more. It goes where the two neighbouring columns it takes end closest together, as
 * high up as it can: so a column can have a gap above it, the less the closer their bottoms are,
 * and none for cards at the top (so a page puts its wide cards first). Wherever it lands, the
 * order stays the page's.
 *
 * Not CSS `columns`, which fills each column top to bottom, so the second card would sit under the
 * first rather than beside it; and not `grid-template-rows: masonry`, which no browser ships yet.
 */
import type { Attachment } from "svelte/attachments";

/**
 * The classes a masonry's container needs, besides its columns and gap: a grid whose cards keep
 * their own height (not stretched to their row's), and in masonry mode rows of 1px with no gap
 * between them, the cards spanning as many as they're tall (the gap between cards is the column
 * gap, which `masonry` adds itself).
 */
export const masonryGrid = "grid items-start data-masonry:auto-rows-[1px] data-masonry:gap-y-0";

/**
 * Where a card goes: its (first) column (from 0), how many it spans, and its top, in px from the
 * container's.
 */
export type Placement = { column: number; span: number; top: number };

/** How many columns a `data-wide` card spans, where there are that many. */
const wideSpan = 2;

/**
 * How much shorter (px) another column must be before a card leaves the column it was in. A card
 * that grows or shrinks a little (a live refresh adds a row to a table) then moves the cards
 * under it up or down, but no card changes columns.
 */
export const stickiness = 64;

/**
 * Places cards of these `heights` in `columns` columns, `gap` px apart: each under the shortest
 * column (the leftmost of equals), unless it was in a column (`previous`, by index) that's at most
 * `stickiness` px taller than that. A card spanning several columns (`spans`, by index; one if
 * not given) goes where its columns end highest, and of those where they end closest together
 * (the least gap above it), then leftmost; it doesn't keep its previous column.
 */
export function placeCards(
	heights: number[],
	columns: number,
	gap: number,
	previous: (number | undefined)[] = [],
	spans: number[] = [],
): Placement[] {
	const bottoms = Array.from({ length: columns }, () => 0);
	return heights.map((height, index) => {
		const span = Math.min(Math.max(1, spans[index] ?? 1), columns);
		let column: number;
		if (span > 1) {
			column = 0;
			let best = { top: Infinity, gaps: Infinity };
			for (let start = 0; start + span <= columns; start++) {
				const taken = bottoms.slice(start, start + span);
				const top = Math.max(...taken);
				const gaps = taken.reduce((sum, bottom) => sum + top - bottom, 0);
				if (top < best.top || (top === best.top && gaps < best.gaps)) {
					best = { top, gaps };
					column = start;
				}
			}
		} else {
			const shortest = bottoms.indexOf(Math.min(...bottoms));
			const before = previous[index];
			column =
				before !== undefined &&
				before < columns &&
				bottoms[before] - bottoms[shortest] <= stickiness
					? before
					: shortest;
		}
		const top = Math.max(...bottoms.slice(column, column + span));
		bottoms.fill(top + height + gap, column, column + span);
		return { column, span, top };
	});
}

/** The grid's items: its children, and the children of those that are `display: contents`. */
function cardsIn(container: Element): HTMLElement[] {
	return [...container.children].flatMap((child) =>
		getComputedStyle(child).display === "contents"
			? cardsIn(child)
			: child instanceof HTMLElement
				? [child]
				: [],
	);
}

function unplace(card: HTMLElement) {
	card.style.removeProperty("grid-column");
	card.style.removeProperty("grid-row");
}

/** How long the container's width must stay put before the columns are counted again (ms). */
const settleDelay = 150;

/**
 * Lays the container's cards out as a masonry, and again whenever one changes height, comes or
 * goes (a module's card loads), or the container changes width (so its number of columns can).
 *
 * Light while the window is resized: a change of the container's width only lays the cards out
 * once it has settled (`settleDelay`), the columns stretching with CSS meanwhile; a card that
 * changes height (a chart redrawn for its new width) is placed again in the next frame without
 * counting the columns anew; and only cards coming or going count as changes to the content, not
 * what happens inside a card (a chart's SVG).
 */
export const masonry: Attachment<HTMLElement> = (container) => {
	/** Each card's column in the last layout, and how many columns that layout had. */
	let columnOf = new WeakMap<Element, number>();
	let laidOutIn = 0;
	let cards: HTMLElement[] = [];
	/** Each card's last placement, as its `grid-column` and `grid-row`, to skip unchanged ones. */
	const placed = new WeakMap<Element, string>();
	let frame = 0;
	let settling: ReturnType<typeof setTimeout> | undefined;
	let width = container.clientWidth;

	const resizes = new ResizeObserver((entries) => {
		const resized = entries.find((entry) => entry.target === container);
		if (resized && container.clientWidth !== width) {
			width = container.clientWidth;
			clearTimeout(settling);
			settling = setTimeout(() => schedule(true), settleDelay);
			return;
		}
		// While the width settles, the cards' heights follow it: they're laid out once it has.
		if (settling === undefined) schedule(false);
	});

	function track() {
		const now = cardsIn(container);
		const known = new Set(cards);
		const current = new Set(now);
		for (const card of cards) if (!current.has(card)) resizes.unobserve(card);
		for (const card of now) if (!known.has(card)) resizes.observe(card);
		cards = now;
	}

	/** The columns CSS makes for the container's width (with the cards' places cleared). */
	function countColumns() {
		// Without the cards' places, which would add columns of their own (implicit ones) once
		// there are fewer: a card's column, or cards in the same rows. All in one frame, so the
		// plain grid is never painted.
		cards.forEach(unplace);
		cards.forEach((card) => placed.delete(card));
		return getComputedStyle(container).gridTemplateColumns.split(" ").filter(Boolean).length;
	}

	/** Lays the cards out; `recount` when the width (so the number of columns) may have changed. */
	function layout(recount: boolean) {
		frame = 0;
		settling = undefined;
		track();
		const columns = recount || !laidOutIn ? countColumns() : laidOutIn;
		if (columns < 2) {
			cards.forEach(unplace);
			delete container.dataset.masonry;
			laidOutIn = 0;
			return;
		}
		const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
		// A card's height as it is: the grid aligns them to the start of their area, not stretched.
		const heights = cards.map((card) => Math.ceil(card.getBoundingClientRect().height));
		const previous = cards.map((card) => (laidOutIn === columns ? columnOf.get(card) : undefined));
		const spans = cards.map((card) => (card.hasAttribute("data-wide") ? wideSpan : 1));
		const placements = placeCards(heights, columns, gap, previous, spans);
		columnOf = new WeakMap();
		placements.forEach(({ column, span, top }, index) => {
			const card = cards[index];
			columnOf.set(card, column);
			const gridColumn = `${column + 1} / span ${span}`;
			const gridRow = `${top + 1} / span ${Math.max(1, heights[index])}`;
			// Only what changed, so an unchanged layout doesn't make the browser lay out again.
			if (placed.get(card) === `${gridColumn}|${gridRow}`) return;
			placed.set(card, `${gridColumn}|${gridRow}`);
			card.style.gridColumn = gridColumn;
			card.style.gridRow = gridRow;
		});
		laidOutIn = columns;
		container.dataset.masonry = "";
	}

	/** Lays out once in the next frame, however many changes come before it. */
	let recountNext = false;
	function schedule(recount: boolean) {
		recountNext ||= recount;
		frame ||= requestAnimationFrame(() => {
			const recount = recountNext;
			recountNext = false;
			layout(recount);
		});
	}

	// Cards coming and going: children of the container or of a `display: contents` wrapper (a
	// slot's), not changes inside a card.
	const mutations = new MutationObserver((records) => {
		const inCard = (node: Node) => cards.some((card) => card === node || card.contains(node));
		if (records.some((record) => !inCard(record.target))) schedule(true);
	});
	mutations.observe(container, { childList: true, subtree: true });
	resizes.observe(container);
	layout(true);

	return () => {
		cancelAnimationFrame(frame);
		clearTimeout(settling);
		mutations.disconnect();
		resizes.disconnect();
		cards.forEach(unplace);
		delete container.dataset.masonry;
	};
};
