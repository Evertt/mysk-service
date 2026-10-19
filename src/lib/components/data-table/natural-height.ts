import type { Attachment } from "svelte/attachments";

/**
 * Attach to the data table's root: sets `--data-table-natural-height` on it to the height it takes
 * with all its rows shown (and the line under them), as they come and go and as it resizes. A table
 * that fills the viewport is size-contained, so its rows don't make it taller; this is what it can
 * shrink to when they don't need the room (see `data-table.svelte`).
 */
export const naturalHeight: Attachment<HTMLElement> = (root) => {
	const area = root.querySelector<HTMLElement>('[data-slot="table-container"]');
	const table = area?.querySelector<HTMLElement>('[data-slot="table"]');
	if (!area || !table) return;
	const update = () => {
		const height = table.getBoundingClientRect().height + edges(area) + edges(root);
		// Rounded up: a table can be a fraction of a pixel taller than its rounded height, and its
		// scroll area would otherwise scroll by that pixel.
		root.style.setProperty("--data-table-natural-height", `${Math.ceil(height)}px`);
	};
	update();
	const resized = new ResizeObserver(update);
	resized.observe(table);
	// Its sideways scrollbar comes and goes as it's narrowed or widened.
	resized.observe(area);
	return () => {
		resized.disconnect();
		root.style.removeProperty("--data-table-natural-height");
	};
};

/** What an element takes in height around its content: borders, padding, a sideways scrollbar. */
function edges(element: HTMLElement) {
	const style = getComputedStyle(element);
	return (
		element.offsetHeight -
		element.clientHeight +
		parseFloat(style.paddingTop) +
		parseFloat(style.paddingBottom)
	);
}
