import type { Attachment } from "svelte/attachments";

/** How long the width must stay put before the element takes it (ms). */
const settleDelay = 150;

/**
 * Attach to a chart's container (`w-full`): while its box changes width (the window being
 * resized), it keeps the width it had, clipped or with room to spare, and takes the new one once
 * it has settled. A chart draws itself anew for every width it's given, and three of them doing so
 * on every frame of a resize made the dashboard freeze; now each draws once a resize is over.
 */
export const settledWidth: Attachment<HTMLElement> = (element) => {
	const box = element.parentElement;
	if (!box) return;
	let width = box.clientWidth;
	let settling: ReturnType<typeof setTimeout> | undefined;

	const resizes = new ResizeObserver(() => {
		if (box.clientWidth === width) return;
		if (settling === undefined) {
			// Holds the chart at the width it was drawn for, without widening its box.
			element.style.width = `${element.offsetWidth}px`;
			box.style.overflow = "hidden";
		}
		width = box.clientWidth;
		clearTimeout(settling);
		settling = setTimeout(() => {
			settling = undefined;
			element.style.removeProperty("width");
			box.style.removeProperty("overflow");
		}, settleDelay);
	});
	resizes.observe(box);

	return () => {
		clearTimeout(settling);
		resizes.disconnect();
		element.style.removeProperty("width");
		box.style.removeProperty("overflow");
	};
};
