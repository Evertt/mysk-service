import { afterEach, expect, test } from "vite-plus/test";

import { squeeze } from "#lib/components/squeeze.ts";

const frames = async (count: number) => {
	for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
};

/** Until the page's fonts have loaded (a squeeze fits again when one does), and two frames. */
const settled = async () => {
	await document.fonts.ready;
	await frames(2);
};

/** Counts the changes to `element`'s style from now on. */
function styleChanges(element: HTMLElement) {
	let count = 0;
	const observer = new MutationObserver((records) => (count += records.length));
	observer.observe(element, { attributes: true, attributeFilter: ["style"] });
	return {
		get count() {
			return count;
		},
		stop: () => observer.disconnect(),
	};
}

let cleanups: (() => void)[] = [];
afterEach(() => {
	cleanups.forEach((cleanup) => cleanup());
	cleanups = [];
	document.querySelectorAll("[data-squeeze-test]").forEach((element) => element.remove());
});

/** A line of `text` at 32px in `style`, squeezed, in the page. */
function squeezed(text: string, style: string) {
	// The size is its parent's: the squeeze takes its own (inline) size off to measure it.
	const parent = document.createElement("div");
	parent.dataset.squeezeTest = "";
	parent.style.fontSize = "32px";
	const element = document.createElement("div");
	element.setAttribute("style", `white-space: nowrap; ${style}`);
	element.textContent = text;
	parent.append(element);
	document.body.append(parent);
	const cleanup = squeeze()(element);
	if (cleanup) cleanups.push(cleanup);
	return element;
}

test("squeezes a number that doesn't fit its box until it does, and leaves one that fits", async () => {
	const tight = squeezed("€178,172.11", "width: 150px");
	const roomy = squeezed("12", "width: 150px");
	await settled();

	expect(parseFloat(tight.style.fontSize)).toBeLessThan(32);
	expect(tight.scrollWidth).toBeLessThanOrEqual(tight.clientWidth + 1);
	expect(roomy.style.fontSize).toBe("");
});

test("squeezes again when its box changes width, and not otherwise", async () => {
	const element = squeezed("€178,172.11", "width: 150px");
	await settled();
	const squeezedTo = parseFloat(element.style.fontSize);

	const changes = styleChanges(element);
	await frames(10);
	expect(changes.count).toBe(0);

	element.style.width = "400px";
	await frames(3);
	expect(element.style.fontSize).toBe("");
	element.style.width = "150px";
	await frames(3);
	expect(parseFloat(element.style.fontSize)).toBe(squeezedTo);
	changes.stop();
});

test("settles in a box as wide as its text, whose width the squeeze changes", async () => {
	// An inline-block up to 150px: squeezed, the text (and so the box) is narrower than that.
	// That change of width is the squeeze's own, and doesn't ask for another; asking would take the
	// squeeze off (the box back at 150px) and put it on again, in a loop with whatever else
	// answers the box's width.
	const element = squeezed("€178,172.11", "display: inline-block; max-width: 150px");
	const changes = styleChanges(element);
	await frames(10);

	expect(parseFloat(element.style.fontSize)).toBeLessThan(32);
	expect(element.clientWidth).toBeLessThan(150);
	expect(changes.count).toBe(0);
	changes.stop();
});
