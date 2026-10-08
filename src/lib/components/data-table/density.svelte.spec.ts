import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { DENSITY_COOKIE, tableDensity } from "./density.svelte.ts";
import { visit } from "./fake-navigation.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The toolbar's saved views (see `saved-views.svelte.spec.ts`): none.
vi.mock("./views.remote.js", () => import("./fake-views.svelte.ts"));

beforeEach(() => visit("/items"));

afterEach(() => {
	tableDensity.current = "comfortable";
	delete document.documentElement.dataset.tableDensity;
	document.cookie = `${DENSITY_COOKIE}=; path=/; max-age=0`;
});

const items: Item[] = [1, 2, 3].map((id) => ({
	id,
	name: `Item ${id}`,
	status: "open",
	amount: 100,
	quantity: 1,
	dueOn: null,
}));

const px = (value: string) => Number.parseFloat(value);

/** The vertical padding of body cells (a pinned one and a plain one) and the header's height. */
function spacing() {
	const row = document.querySelector("tbody tr")!;
	const pinned = row.querySelector<HTMLElement>("td[data-pinned]")!;
	const plain = row.querySelector<HTMLElement>("td:not([data-pinned])")!;
	return {
		pinned: px(getComputedStyle(pinned).paddingTop),
		plain: px(getComputedStyle(plain).paddingBottom),
		// Rounded down: the row's collapsed border can add half a pixel.
		header: Math.floor(document.querySelector("thead th")!.getBoundingClientRect().height),
	};
}

async function choose(density: "Compact" | "Comfortable") {
	await page.getByRole("button", { name: "View" }).click();
	await page.getByRole("menuitemradio", { name: density }).click();
}

describe("density", () => {
	test("tables start comfortable", async () => {
		render(Harness, { items });
		await expect.element(page.getByRole("table")).toBeVisible();
		expect(spacing()).toEqual({ pinned: 8, plain: 8, header: 40 });
	});

	test("the view menu makes every table compact, and remembers it in a cookie", async () => {
		render(Harness, { items });
		await choose("Compact");
		await expect
			.element(page.getByRole("menuitemradio", { name: "Compact" }))
			.toHaveAttribute("aria-checked", "true");
		expect(document.documentElement.dataset.tableDensity).toBe("compact");
		expect(document.cookie).toContain(`${DENSITY_COOKIE}=compact`);
		expect(spacing()).toEqual({ pinned: 4, plain: 4, header: 32 });

		await page.getByRole("menuitemradio", { name: "Comfortable" }).click();
		expect(document.documentElement.dataset.tableDensity).toBe("comfortable");
		expect(document.cookie).toContain(`${DENSITY_COOKIE}=comfortable`);
		expect(spacing()).toEqual({ pinned: 8, plain: 8, header: 40 });
	});

	test("a page rendered compact (from the cookie) shows compact rows", async () => {
		document.documentElement.dataset.tableDensity = "compact";
		render(Harness, { items });
		await expect.element(page.getByRole("table")).toBeVisible();
		expect(spacing()).toEqual({ pinned: 4, plain: 4, header: 32 });
	});
});
