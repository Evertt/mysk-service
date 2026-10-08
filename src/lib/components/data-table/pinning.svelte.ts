import type { Attachment } from "svelte/attachments";
import { SvelteMap } from "svelte/reactivity";

import { cn } from "#lib/utils.ts";

/** What the pinning needs of a column. */
interface PinnableColumn {
	id: string;
	getIsGrouped(): boolean;
}

/** What the pinning needs of the table (TanStack Table's, with column pinning). */
interface PinnableTable {
	getStartVisibleLeafColumns(): PinnableColumn[];
	getEndVisibleLeafColumns(): PinnableColumn[];
}

interface Pin {
	side: "start" | "end";
	/** The distance from its side: the widths of the pinned columns before it. */
	offset: number;
	/** The innermost pinned column on its side, which casts the shadow. */
	edge: boolean;
	/** The outermost pinned column on its side, at the edge of the scroll area. */
	outer: boolean;
}

// Below `sm` nothing is pinned: on a phone the pinned columns would leave too little room for
// the rest, so the whole row scrolls.
const side = {
	start: "sm:sticky sm:start-(--pin-offset)",
	end: "sm:sticky sm:end-(--pin-offset)",
};

const shadow = {
	start:
		"after:start-full after:border-s after:bg-linear-to-r sm:group-data-[overflow-start]/data-table:after:opacity-100",
	end: "after:end-full after:border-e after:bg-linear-to-l sm:group-data-[overflow-end]/data-table:after:opacity-100",
};

// While a focused row (see `row-navigation.svelte.ts`) is scrolled sideways, its ends are out of
// view: the outermost pinned cells, at the scroll area's edges, draw the focus ring's sides there.
const focusEdge = {
	start:
		"group-focus-visible/row:before:shadow-[inset_2px_0_var(--color-ring)] rtl:group-focus-visible/row:before:shadow-[inset_-2px_0_var(--color-ring)]",
	end: "group-focus-visible/row:before:shadow-[inset_-2px_0_var(--color-ring)] rtl:group-focus-visible/row:before:shadow-[inset_2px_0_var(--color-ring)]",
};

/**
 * Sticks a data table's pinned columns (see `default-pinning.ts`) to the sides of its scroll
 * area. A pinned column sits after the widths of those pinned before it, which are measured from
 * their headers: attach `measure(id)` to a pinned header, and spread `pinned(id)` on the cells.
 */
export function createPinning(table: PinnableTable) {
	/** The rendered widths of the pinned columns, from their headers, to offset the next ones. */
	const widths = new SvelteMap<string, number>();

	// One attachment per column, so re-rendering a header doesn't re-attach it.
	const measurers = new Map<string, Attachment<HTMLElement>>();

	function measure(id: string) {
		let measurer = measurers.get(id);
		if (!measurer) {
			measurer = (element) => {
				const update = () => {
					const width = element.getBoundingClientRect().width;
					if (widths.get(id) !== width) widths.set(id, width);
				};
				update();
				const observer = new ResizeObserver(update);
				observer.observe(element);
				return () => observer.disconnect();
			};
			measurers.set(id, measurer);
		}
		return measurer;
	}

	const pins = $derived.by(() => {
		const result = new Map<string, Pin>();
		const place = (side: Pin["side"], columns: { id: string }[]) => {
			let offset = 0;
			columns.forEach((column, index) => {
				result.set(column.id, {
					side,
					offset,
					edge: index === columns.length - 1,
					outer: index === 0,
				});
				offset += widths.get(column.id) ?? 0;
			});
		};
		const shown = (column: PinnableColumn) => !column.getIsGrouped();
		place("start", table.getStartVisibleLeafColumns().filter(shown));
		place("end", table.getEndVisibleLeafColumns().filter(shown).toReversed());
		return result;
	});

	return {
		measure,
		/** Attributes and classes for a pinned column's cells (none for other columns). */
		pinned(id: string): { "data-pinned"?: Pin["side"]; style?: string; class?: string } {
			const pin = pins.get(id);
			if (!pin) return {};
			return {
				"data-pinned": pin.side,
				style: `--pin-offset: ${pin.offset}px`,
				class: cn(
					side[pin.side],
					pin.outer && focusEdge[pin.side],
					pin.edge && [
						"after:pointer-events-none after:absolute after:inset-y-0 after:w-3 after:border-border after:from-black/8 after:to-transparent after:opacity-0 after:transition-opacity dark:after:from-black/40",
						shadow[pin.side],
					],
				),
			};
		},
		/** A pinned column's width (0 if it isn't pinned): how far to offset what follows it. */
		offsetOf(id: string) {
			return pins.has(id) ? (widths.get(id) ?? 0) : 0;
		},
	};
}
