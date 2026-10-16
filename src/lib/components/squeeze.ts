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
 * Measured again when its box changes width or its text changes.
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
		let width = -1;
		let frame = 0;

		function fit() {
			frame = 0;
			// Its own size, without a squeeze.
			element.style.removeProperty("letter-spacing");
			element.style.removeProperty("font-size");
			width = box.clientWidth;
			if (box.scrollWidth <= width + 1) return;
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

		const schedule = () => {
			frame ||= requestAnimationFrame(fit);
		};
		// Only a change of width: a squeeze changes the height, which would ask again.
		const resizes = new ResizeObserver(() => {
			if (box.clientWidth !== width) schedule();
		});
		resizes.observe(box);
		const changes = new MutationObserver(schedule);
		changes.observe(element, { childList: true, subtree: true, characterData: true });
		fit();

		return () => {
			cancelAnimationFrame(frame);
			resizes.disconnect();
			changes.disconnect();
		};
	};
	return attachment;
}
