import type { Attachment } from "svelte/attachments";

/** A step of squeezing: letter spacing (em) and font size (a share of the text's own). */
interface Step {
	tracking: number;
	scale: number;
}

/**
 * Squeezes text that doesn't quite fit its box, as Finder does a long file name: first a little
 * tighter, then a little smaller, step by step, and no further than `min` of its size; whatever
 * still doesn't fit overflows as before (a table scrolls, a column drops at its breakpoint).
 *
 * - `{@attach squeeze()}` on a line of text (a big number): it squeezes to fit its own width
 *   (give it `whitespace-nowrap`), down to half its size.
 * - `{@attach squeeze({ within: "[data-slot=table-container]", min: 0.88 })}` on a table: it
 *   squeezes its text until its scroll area (the closest match of `within`) no longer scrolls.
 *
 * Measured again when its box changes width (to one its last fit didn't give it), its text
 * changes or a font loads. Each fit starts from the text's own size, so it comes out the same for
 * the same width, and it can't keep itself going: the width its squeeze gives a box that's as
 * wide as its text doesn't ask for another.
 */
export function squeeze({ within, min = 0.5 }: { within?: string; min?: number } = {}) {
	const steps: Step[] = [
		{ tracking: 0, scale: 1 },
		{ tracking: -0.01, scale: 1 },
		{ tracking: -0.02, scale: 1 },
	];
	for (let scale = 0.96; scale >= min - 0.001; scale -= 0.04) {
		steps.push({ tracking: -0.02, scale: Math.round(scale * 100) / 100 });
	}

	const attachment: Attachment<HTMLElement> = (element) => {
		const box = (within && element.closest<HTMLElement>(within)) || element;
		/** The box's widths in the last fit: without the squeeze, and with it. */
		let fittedAt = new Set<number>();
		let frame = 0;

		/** Squeezes the text step by step until it fits its box's `width` without a squeeze. */
		function squeezeInto(width: number) {
			const style = getComputedStyle(element);
			const size = parseFloat(style.fontSize);
			// Tighter than its own spacing (a theme's may be wide), in px of its own size.
			const spacing = parseFloat(style.letterSpacing) || 0;
			for (const { tracking, scale } of steps.slice(1)) {
				element.style.letterSpacing = `${spacing + tracking * size}px`;
				element.style.fontSize = `${size * scale}px`;
				if (box.scrollWidth <= width + 1) return;
			}
		}

		function fit() {
			frame = 0;
			// Its own size, without a squeeze.
			element.style.removeProperty("letter-spacing");
			element.style.removeProperty("font-size");
			const width = box.clientWidth;
			if (box.scrollWidth > width + 1) squeezeInto(width);
			fittedAt = new Set([width, box.clientWidth]);
		}

		const schedule = () => {
			frame ||= requestAnimationFrame(fit);
		};
		// Only a change of width (a squeeze changes the height, which would ask again), and only to
		// a width the last fit didn't see: a box as wide as its text (its grid track's minimum, an
		// inline-block's) changes width with the squeeze, which mustn't ask for another, nor flip
		// the box between the two.
		const resizes = new ResizeObserver(() => {
			if (!fittedAt.has(box.clientWidth)) schedule();
		});
		resizes.observe(box);
		const changes = new MutationObserver(schedule);
		changes.observe(element, { childList: true, subtree: true, characterData: true });
		// A font that loads after the fit (the theme's) makes the text wider or narrower.
		document.fonts.addEventListener("loadingdone", schedule);
		fit();

		return () => {
			cancelAnimationFrame(frame);
			resizes.disconnect();
			changes.disconnect();
			document.fonts.removeEventListener("loadingdone", schedule);
		};
	};
	return attachment;
}
