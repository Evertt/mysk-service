import type { Attachment } from "svelte/attachments";

/** Whether there's more to scroll to sideways, at either end of a table's scroll area. */
export interface Overflow {
	start: boolean;
	end: boolean;
}

/**
 * Attach to the data table's root: reports to `set` whether its scroll area (the table
 * container) has more to scroll to sideways, under the pinned columns, as it scrolls and resizes.
 */
export function trackOverflow(set: (overflow: Overflow) => void): Attachment<HTMLElement> {
	return (root) => {
		const area = root.querySelector<HTMLElement>('[data-slot="table-container"]');
		if (!area) return;
		const update = () => {
			// Negative in right-to-left layouts.
			const scrolled = Math.abs(area.scrollLeft);
			set({
				start: scrolled > 0,
				end: scrolled < area.scrollWidth - area.clientWidth - 1,
			});
		};
		update();
		area.addEventListener("scroll", update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(area);
		if (area.firstElementChild) observer.observe(area.firstElementChild);
		return () => {
			area.removeEventListener("scroll", update);
			observer.disconnect();
		};
	};
}
