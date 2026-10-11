import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Harness, { overlays } from "./overlays.test-harness.svelte";

/** The overlay's animated parts: its content, and the backdrop of dialogs and sheets. */
const animated = () =>
	[...document.querySelectorAll<HTMLElement>("[data-slot$='-content'], [data-slot$='-overlay']")]
		// The tooltip's arrow and the select's viewport are inside the content.
		.filter((element) => !element.parentElement?.closest("[data-slot$='-content']"));

const settled = (elements: HTMLElement[]) =>
	Promise.all(elements.flatMap((element) => element.getAnimations().map((a) => a.finished)));

interface Frame {
	slot: string;
	opacity: number;
	fill: string;
}

/** Each frame until `elements` are gone: their opacity and fill mode while still in the page. */
function sampleUntilRemoved(elements: HTMLElement[]) {
	return new Promise<Frame[]>((resolve) => {
		const frames: Frame[] = [];
		const frame = () => {
			const present = elements.filter((element) => element.isConnected);
			if (present.length === 0) return resolve(frames);
			for (const element of present) {
				const style = getComputedStyle(element);
				frames.push({
					slot: element.dataset.slot!,
					opacity: Number(style.opacity),
					fill: style.animationFillMode,
				});
			}
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	});
}

// The sampling follows real frames and animations of a real browser, which a loaded machine
// (a full run next to other work) can stretch well past Vitest's default, so it gets room.
test.each(overlays)(
	"a closing %s fades out without flashing back in",
	async (overlay) => {
		const screen = render(Harness, { overlay, open: true });
		await expect.poll(() => animated().length, { timeout: 10_000 }).toBeGreaterThan(0);
		const elements = animated();
		await settled(elements);

		const sampling = sampleUntilRemoved(elements);
		await screen.rerender({ overlay, open: false });
		const frames = await sampling;

		for (const slot of new Set(frames.map((frame) => frame.slot))) {
			const own = frames.filter((frame) => frame.slot === slot);
			const closing = own.slice(own.findIndex((frame) => frame.opacity < 1));
			expect(closing.length, `${slot} fades out`).toBeGreaterThan(1);
			// Without `animation-fill-mode: forwards` the element jumps back to its full opacity when the
			// exit animation ends, and stays there until it's removed: a flicker at the end of the close.
			expect(Math.max(...closing.map((frame) => frame.opacity)), slot).toBeLessThan(1);
			expect(closing.at(-1)!.opacity, slot).toBeLessThan(0.05);
			expect(own.at(-1)!.fill, slot).toBe("forwards");
		}
	},
	60_000,
);
