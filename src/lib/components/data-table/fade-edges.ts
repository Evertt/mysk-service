import type { Attachment } from "svelte/attachments";

/**
 * Attach to an element that scrolls sideways (the toolbar's row of filter pills): marks it
 * `data-fade-start` / `data-fade-end` while there's more to scroll to at that end, as it scrolls,
 * resizes or its content changes, for its styles to fade that edge out.
 */
export const fadeEdges: Attachment<HTMLElement> = (area) => {
	const update = () => {
		// Negative in right-to-left layouts.
		const scrolled = Math.abs(area.scrollLeft);
		area.toggleAttribute("data-fade-start", scrolled > 0);
		area.toggleAttribute("data-fade-end", scrolled < area.scrollWidth - area.clientWidth - 1);
	};
	update();
	area.addEventListener("scroll", update, { passive: true });
	const resized = new ResizeObserver(update);
	resized.observe(area);
	// Pills come and go, and change their width as their values do.
	const changed = new MutationObserver(update);
	changed.observe(area, { childList: true, subtree: true, characterData: true });
	return () => {
		area.removeEventListener("scroll", update);
		resized.disconnect();
		changed.disconnect();
	};
};
