/**
 * What the tests of the pages with a masonry (`#lib/components/masonry.ts`: the dashboard, a
 * unit's page) share: its cards' boxes, and checks of how they're packed.
 */
import type { Locator } from "playwright";
import { expect } from "vite-plus/test";

export type Box = { title: string; left: number; top: number; right: number; bottom: number };

/**
 * The boxes of a masonry's cards (its items: the container's children, and the children of those
 * that are `display: contents`, as a slot's wrapper), with their titles, in page order.
 */
export const cardBoxes = (container: Locator) =>
	container.evaluate((element): Box[] => {
		const items = (parent: Element): Element[] =>
			[...parent.children].flatMap((child) =>
				getComputedStyle(child).display === "contents" ? items(child) : [child],
			);
		return items(element).map((card) => {
			const { left, top, right, bottom } = card.getBoundingClientRect();
			const title =
				card.querySelector('[data-slot="card-title"]')?.textContent?.trim() ??
				card.getAttribute("data-extension-failed") ??
				"";
			return { title, left, top, right, bottom };
		});
	});

/**
 * The boxes of a masonry's cards once it has packed them and they've stopped moving (a card that
 * changes height after hydrating is placed again in the next frame).
 */
export async function packedBoxes(container: Locator) {
	await expect
		.poll(() => container.and(container.page().locator("[data-masonry]")).count())
		.toBe(1);
	let last = "";
	let boxes: Box[] = [];
	await expect
		.poll(async () => {
			boxes = await cardBoxes(container);
			const now = JSON.stringify(boxes);
			const same = now === last;
			last = now;
			return same;
		})
		.toBe(true);
	return boxes;
}

/** Checks that no two cards overlap (by more than a pixel's rounding). */
export function expectApart(boxes: Box[]) {
	for (const [index, a] of boxes.entries()) {
		for (const b of boxes.slice(index + 1)) {
			const overlap =
				a.left < b.right - 1 &&
				b.left < a.right - 1 &&
				a.top < b.bottom - 1 &&
				b.top < a.bottom - 1;
			expect(overlap, `${a.title} overlaps ${b.title}`).toBe(false);
		}
	}
}

/** The cards' columns: their left edges. */
export const columnsOf = (boxes: Box[]) => new Set(boxes.map((box) => Math.round(box.left)));
