/**
 * A data table's scrolling (see `scroll-window.svelte.ts`), for `data-table.svelte`:
 *
 * - **More rows** as the end comes near: an `IntersectionObserver` on an element under the rows
 *   (the caption that says more are loading), within `margin` of the scroll area's edge, asks the
 *   window for more. For a server-side table opened partway down, the first row does the same
 *   for the rows before it, which then come in above without moving what's in view.
 * - **Where it is** in the URL (`?row=`, see `TableUrlSync.keepPosition`): the index of the first
 *   row in view, among all those that match, kept up to date a moment after scrolling stops, and
 *   scrolled back to when the table opens (a link, a reload, coming back to the page).
 * - **Back to the top** when the rows are for another search, filter, sorting or grouping.
 *
 * The rows scroll inside the table on larger screens (`fillViewport`) and with the page on
 * smaller ones: whichever scrolls is the scroll area.
 */
import { tick } from "svelte";
import type { Attachment } from "svelte/attachments";

import type { ScrollWindow } from "./scroll-window.svelte.ts";
import type { TableUrlSync } from "./url-sync.svelte.ts";

/** How far from the scroll area's edge more rows are asked for, in pixels. */
const margin = 600;

/** How long after scrolling the URL follows, in milliseconds. */
const positionDelay = 250;

/** What the scrolling needs of the table (TanStack Table's). */
interface ScrollingTable {
	getRowModel(): { rows: { id: string }[] };
}

/** Whether an element scrolls its content vertically (the table's container, when it fills the viewport). */
function scrollsVertically(element: Element) {
	const { overflowY } = getComputedStyle(element);
	return overflowY === "auto" || overflowY === "scroll";
}

/**
 * Sets up the scrolling of a table whose rows `window` says (none: the table doesn't scroll its
 * rows), with `sync` its link with the URL, if any. `loading` says whether the rows shown are for
 * another state than the table's (a server-side table waiting). Attach `table` to the `<table>`
 * and `sentinel` to an element under the rows.
 */
export function tableScrolling(
	table: ScrollingTable,
	window: () => ScrollWindow | undefined,
	sync: () => TableUrlSync | undefined,
	loading: () => boolean,
) {
	let element = $state<HTMLTableElement>();
	let sentinel = $state<HTMLElement>();
	/** Whether the table has been scrolled to where the URL said (or there was nowhere to go). */
	let placed = $state(false);
	/** Grows when the scroll area may have changed (the page resized), to observe anew. */
	let resized = $state(0);

	/** The element that scrolls the rows: the table's container, or the page. */
	const scroller = (table: HTMLTableElement) => {
		const container = table.parentElement;
		return container && scrollsVertically(container) ? container : undefined;
	};

	/** The data rows' elements (not the groups' rows), in order. */
	const rowElements = (table: HTMLTableElement) =>
		[...(table.tBodies[0]?.rows ?? [])].filter(
			(row) => row.dataset.rowId !== undefined && row.dataset.group === undefined,
		);

	/** Where the rows' visible part starts: under the sticky header, or the top of the screen. */
	function visibleTop(table: HTMLTableElement) {
		const container = scroller(table);
		if (!container) return 0;
		// The header cells stick (not the header itself, which scrolls away).
		return container.getBoundingClientRect().top + (table.tHead?.offsetHeight ?? 0);
	}

	/** The first row in view (at least partly), if any. */
	function firstVisible(table: HTMLTableElement) {
		const rows = rowElements(table);
		const top = visibleTop(table) + 1;
		let low = 0;
		let high = rows.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (rows[middle].getBoundingClientRect().bottom > top) high = middle;
			else low = middle + 1;
		}
		return rows[low];
	}

	/** Whether an element is within `margin` of the scroll area's visible part. */
	function near(table: HTMLTableElement, element: Element) {
		const container = scroller(table);
		const area = container
			? container.getBoundingClientRect()
			: { top: 0, bottom: globalThis.innerHeight };
		const box = element.getBoundingClientRect();
		return box.bottom >= area.top - margin && box.top <= area.bottom + margin;
	}

	/** Scrolls the scroll area by `delta` pixels. */
	function scrollBy(table: HTMLTableElement, delta: number) {
		const container = scroller(table);
		if (container) container.scrollTop += delta;
		else globalThis.scrollBy(0, delta);
	}

	const rows = () => table.getRowModel().rows;
	const rowById = (table: HTMLTableElement, id: string) =>
		table.tBodies[0]?.querySelector<HTMLTableRowElement>(
			`:scope > tr[data-row-id="${CSS.escape(id)}"]`,
		) ?? undefined;

	// Scrolled to where the URL says, once the rows are there.
	$effect(() => {
		const table = element;
		const current = window();
		if (!table || placed) return;
		const position = sync()?.position ?? 0;
		const index = current ? position - current.start : -1;
		const id = index > 0 ? rows()[index]?.id : undefined;
		// The scroll area keeps the header's height clear at the top (`scroll-padding`).
		if (id !== undefined) rowById(table, id)?.scrollIntoView({ block: "start" });
		placed = true;
	});

	// More rows (or earlier ones) when the end (or start) comes near; observed anew whenever the
	// rows change, as an observer only calls back when something enters or leaves.
	$effect(() => {
		const table = element;
		const end = sentinel;
		const current = window();
		void resized;
		if (!table || !current || !placed) return;
		void rows();
		const more = current.more && !current.loadingMore;
		const earlier = current.earlier && !current.loadingEarlier;
		if (!more && !earlier) return;
		let observer: IntersectionObserver | undefined;
		let gone = false;
		// Once the rows are rendered (TanStack's rows follow the data a moment later), or the old
		// ones would still be in view and ask for more again.
		void tick().then(() => {
			if (gone) return;
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						// Still near, as the rows are now: they may have changed since it was seen.
						if (!entry.isIntersecting || !near(table, entry.target)) continue;
						if (entry.target === end) current.loadMore();
						else current.loadEarlier();
					}
				},
				{ root: scroller(table) ?? null, rootMargin: `${margin}px 0px ${margin}px 0px` },
			);
			const first = earlier ? rowElements(table)[0] : undefined;
			if (more && end) observer.observe(end);
			if (first) observer.observe(first);
		});
		return () => {
			gone = true;
			observer?.disconnect();
		};
	});

	$effect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onresize = () => {
			clearTimeout(timer);
			timer = setTimeout(() => resized++, 200);
		};
		globalThis.addEventListener("resize", onresize, { passive: true });
		return () => {
			clearTimeout(timer);
			globalThis.removeEventListener("resize", onresize);
		};
	});

	// Rows that come in above leave in view what was: the scroll area scrolls down by as much as
	// they take, which is how far the row that was first has moved down in the table. That's the
	// rows before those loaded (scrolling up from where the table opened), and rows a refresh adds
	// above what's in view (a new order, newest first), unless the table is at its top, where the
	// new rows are what's to see.
	let first: { key: string; id: string; offset: number } | undefined;
	/** The window's start, and whether it moved up since (whose rows TanStack then renders). */
	let start: { key: string; at: number; earlier: boolean } | undefined;
	$effect(() => {
		const current = window();
		const table = element;
		void rows();
		if (!table || !current) return;
		const { key } = current;
		const earlier = start?.key === key && (start.earlier || current.start < start.at);
		start = { key, at: current.start, earlier };
		// Once the rows are rendered.
		void tick().then(() => {
			if (element !== table) return;
			const top = rowElements(table)[0];
			if (first && first.key === key && top && top.dataset.rowId !== first.id) {
				const row = rowById(table, first.id);
				const moved = row ? row.offsetTop - first.offset : 0;
				const scrolled = (scroller(table)?.scrollTop ?? globalThis.scrollY) > 0;
				if (moved > 0 && (start?.earlier || scrolled)) scrollBy(table, moved);
				if (start?.key === key) start.earlier = false;
			}
			first = top && { key, id: top.dataset.rowId!, offset: top.offsetTop };
		});
	});

	// Other rows start at the top.
	let key: string | undefined;
	$effect(() => {
		const next = window()?.key;
		const table = element;
		if (!table) return;
		if (key !== undefined && next !== key) {
			const container = scroller(table);
			if (container) container.scrollTop = 0;
			else {
				const top = table.getBoundingClientRect().top;
				if (top < 0) globalThis.scrollBy(0, top);
			}
		}
		key = next;
	});

	// The position into the URL, a moment after scrolling stops.
	$effect(() => {
		const table = element;
		if (!table || !placed) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const keep = () => {
			timer = undefined;
			const current = window();
			const link = sync();
			if (!current || !link || loading()) return;
			const id = firstVisible(table)?.dataset.rowId;
			const index = id === undefined ? -1 : rows().findIndex((row) => row.id === id);
			link.keepPosition(index < 0 ? 0 : current.start + index);
		};
		const onscroll = (event: Event) => {
			const target = event.target;
			if (target !== document && target !== scroller(table)) return;
			clearTimeout(timer);
			timer = setTimeout(keep, positionDelay);
		};
		globalThis.addEventListener("scroll", onscroll, { capture: true, passive: true });
		return () => {
			clearTimeout(timer);
			globalThis.removeEventListener("scroll", onscroll, { capture: true });
		};
	});

	return {
		table: ((table) => {
			element = table;
			return () => {
				if (element === table) element = undefined;
			};
		}) satisfies Attachment<HTMLTableElement>,
		sentinel: ((node) => {
			sentinel = node;
			return () => {
				if (sentinel === node) sentinel = undefined;
			};
		}) satisfies Attachment<HTMLElement>,
	};
}
