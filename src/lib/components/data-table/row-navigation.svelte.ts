import { type Attachment, createAttachmentKey } from "svelte/attachments";

/**
 * Keyboard navigation of a data table's rows, in a "row focus" model: each row shown can take
 * focus, one of them is in the tab order (the last one focused, else the first), and on a focused
 * row
 *
 * - ↑/↓ move to the row above or below, Home/End to the first or last row loaded (the table loads
 *   more as the last comes into view, see `scroll-window.svelte.ts`),
 * - PageUp/PageDown move a screenful of rows up or down,
 * - Enter opens the row's page: it follows the row's first link (that of its identifying column),
 * - Space selects or deselects the row, if the table has a selection column.
 *
 * When the rows are grouped (see `grouping.ts`), each group's header row (`data-group`) takes
 * part too, and Enter or Space on it clicks its toggle (`data-group-toggle`), showing or hiding
 * the group's rows.
 *
 * The cells' own controls (links, checkboxes, the actions menu) stay in the tab order and keep
 * their keys: only keys pressed on a row itself are handled here, so nothing traps focus.
 *
 * This is a lighter model than the WAI-ARIA grid pattern (a single tab stop, arrow keys between
 * cells, controls inside cells out of the tab order until a cell is entered): rows are what one
 * opens and selects here, and the cells' controls work as they do anywhere else. The table keeps
 * its native table semantics, so screen readers' own table navigation keeps working too.
 */

/** What the navigation needs of the rows shown (TanStack Table's `Row`). */
interface NavigableRow {
	id: string;
	getCanSelect(): boolean;
	toggleSelected(value?: boolean): void;
}

/** What the navigation needs of the table (TanStack Table's, with selection). */
interface NavigableTable {
	getRowModel(): { rows: NavigableRow[] };
	getVisibleLeafColumns(): { id: string }[];
}

/** The column with the selection checkboxes (see `default-pinning.ts`). */
const SELECT_COLUMN = "select";

/**
 * Sets up keyboard navigation of a table's rows. Spread `body` on the table body and give each
 * row `tabindex={navigation.tabIndex(row.id)}` and `data-row-id={row.id}`. `rowIds` are those of
 * the rows shown, in order, if not the table's rows (e.g. with group rows, and without collapsed
 * groups' rows).
 */
export function createRowNavigation(
	table: NavigableTable,
	{ rowIds }: { rowIds?: () => string[] } = {},
) {
	let body: HTMLElement | undefined;
	/** The id of the last row that had focus (or focus inside it). */
	let active = $state<string>();

	const ids = () => rowIds?.() ?? table.getRowModel().rows.map((row) => row.id);

	/** The row in the tab order: the active one if it's still shown, else the first. */
	const tabbable = $derived.by(() => {
		const shown = ids();
		return active !== undefined && shown.includes(active) ? active : shown[0];
	});

	const rowElements = () =>
		body ? [...body.querySelectorAll<HTMLTableRowElement>(":scope > tr[data-row-id]")] : [];

	/** Focuses the row at `index` (clamped to the rows shown), scrolling it into view if need be. */
	function focusRow(index: number) {
		const rows = rowElements();
		const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
		if (!row) return;
		row.focus({ preventScroll: true });
		// "nearest" scrolls only as far as needed; the table's scroll area has a scroll padding as
		// tall as its sticky header, so the row doesn't end up under it.
		row.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	/** How many rows fit in the table's scroll area (or the screen), less one: a "page" of them. */
	function screenful(row: HTMLElement) {
		const container = body?.closest<HTMLElement>("[data-slot=table-container]");
		const scrolls = container && /auto|scroll/.test(getComputedStyle(container).overflowY);
		const height = scrolls ? container.clientHeight : globalThis.innerHeight;
		return Math.max(1, Math.floor(height / Math.max(row.offsetHeight, 1)) - 1);
	}

	function onfocusin(event: FocusEvent) {
		const row = (event.target as Element).closest<HTMLElement>("tr[data-row-id]");
		if (row && row.parentElement === body) active = row.dataset.rowId;
	}

	function onkeydown(event: KeyboardEvent) {
		const element = event.target;
		if (!(element instanceof HTMLTableRowElement) || element.parentElement !== body) return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const rows = rowElements();
		const index = rows.indexOf(element);
		if ((event.key === "Enter" || event.key === " ") && element.hasAttribute("data-group")) {
			element.querySelector<HTMLElement>("[data-group-toggle]")?.click();
			event.preventDefault();
			return;
		}
		switch (event.key) {
			case "ArrowDown":
				focusRow(index + 1);
				break;
			case "ArrowUp":
				focusRow(index - 1);
				break;
			case "Home":
				focusRow(0);
				break;
			case "End":
				focusRow(rows.length - 1);
				break;
			case "PageDown":
				focusRow(index + screenful(element));
				break;
			case "PageUp":
				focusRow(index - screenful(element));
				break;
			case "Enter":
				element.querySelector<HTMLAnchorElement>("a[href]")?.click();
				break;
			case " ": {
				const row = table.getRowModel().rows.find((row) => row.id === element.dataset.rowId);
				const selectable = table
					.getVisibleLeafColumns()
					.some((column) => column.id === SELECT_COLUMN);
				if (row && selectable && row.getCanSelect()) row.toggleSelected();
				break;
			}
			default:
				return;
		}
		event.preventDefault();
	}

	return {
		/** Attributes (handlers and an attachment) for the table body. */
		body: {
			onfocusin,
			onkeydown,
			[createAttachmentKey()]: ((element) => {
				body = element;
				return () => {
					if (body === element) body = undefined;
				};
			}) satisfies Attachment<HTMLElement>,
		},
		/** A row's `tabindex`: 0 for the row in the tab order, -1 for the others. */
		tabIndex: (id: string) => (id === tabbable ? 0 : -1),
	};
}
