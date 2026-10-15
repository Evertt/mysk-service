/**
 * The orders list as it scrolls (see `scroll-window.svelte.ts` and `scroll-position.svelte.ts`):
 * where it is goes into the URL, a link opens it there with the rows above loading on the way up,
 * another sorting starts at the top, and the selection keeps to the rows loaded.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "#lib/i18n/format.ts";

import { organizations, rows, useApp, value } from "./app.ts";
import { shownNumbers } from "./orders-helpers.ts";

const { north } = organizations;
const app = useApp();

/** North's completed orders, by number: more than three pages of rows. */
const completed = async () =>
	(
		await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status = 'completed'
			 order by number collate nocase, id`,
			[north.id],
		)
	).map((row) => row.number);
const list = "/orders?status=completed&sort=number";

const area = () => app.page.locator('[data-slot="data-table"] [data-slot="table-container"]');
const bodyRows = () => app.page.locator('[data-slot="data-table"] tbody tr');
const more = () => app.page.locator('[data-slot="data-table-more"]');
/** Where the URL says the table is scrolled to (`?row=`, 1-based), if anywhere. */
const position = () => new URL(app.page.url()).searchParams.get("row");

/** Scrolls to the end of the rows, and waits for the next ones. */
async function loadMore() {
	const before = await bodyRows().count();
	await more().scrollIntoViewIfNeeded();
	await expect.poll(() => bodyRows().count()).toBeGreaterThan(before);
}

/** How far a row (by its order number) is from the top of the rows' visible part, in pixels. */
const fromTop = (number: string) =>
	app.page.evaluate((number) => {
		const area = document.querySelector('[data-slot="data-table"] [data-slot="table-container"]')!;
		// The header's cells stick to the top of the scroll area.
		const header = area.querySelector<HTMLElement>("thead")!;
		const row = [...area.querySelectorAll("tbody tr")].find((tr) =>
			tr.textContent?.includes(number),
		);
		return (
			row!.getBoundingClientRect().top - area.getBoundingClientRect().top - header.offsetHeight
		);
	}, number);

describe("in North", () => {
	test("the position goes into the URL as the rows scroll, with the filters and sorting", async () => {
		const numbers = await completed();
		expect(numbers.length).toBeGreaterThan(150);
		await app.go(list);
		expect(await shownNumbers(app)).toEqual(numbers.slice(0, 50));
		await loadMore();
		expect(await shownNumbers(app)).toEqual(numbers.slice(0, 100));

		// The 71st row at the top.
		await bodyRows()
			.nth(70)
			.evaluate((row) => row.scrollIntoView({ block: "start" }));
		await expect.poll(position).toMatch(/^7[01]$/);
		const url = new URL(app.page.url());
		expect(url.searchParams.get("status")).toBe("completed");
		expect(url.searchParams.get("sort")).toBe("number");

		// Back at the top, the URL says so.
		await area().evaluate((element) => element.scrollTo({ top: 0 }));
		await expect.poll(position).toBeNull();
	});

	test("a link with a position opens the list there, and the rows above load on the way up", async () => {
		const numbers = await completed();
		await app.go(`${list}&row=71`);
		// From the page with the 71st row: the rows from the 51st on.
		await expect.poll(() => shownNumbers(app).then((shown) => shown[0])).toBe(numbers[50]);
		// The 71st at the top.
		await expect.poll(() => fromTop(numbers[70])).toBeLessThan(5);
		expect(await fromTop(numbers[70])).toBeGreaterThan(-5);

		// Up to the first row loaded: the fifty before it come in above, and what was in view stays.
		await bodyRows()
			.first()
			.evaluate((row) => row.scrollIntoView({ block: "start" }));
		await expect.poll(() => shownNumbers(app).then((shown) => shown[0])).toBe(numbers[0]);
		expect(await fromTop(numbers[50])).toBeGreaterThan(-60);
		expect(await fromTop(numbers[50])).toBeLessThan(60);
		expect((await shownNumbers(app)).slice(0, 51)).toEqual(numbers.slice(0, 51));
	});

	test("another sorting starts at the top, with the first rows", async () => {
		await app.go(list);
		await loadMore();
		await bodyRows()
			.nth(80)
			.evaluate((row) => row.scrollIntoView({ block: "start" }));
		await expect.poll(position).not.toBeNull();

		await app.sortBy("Order", "descending");
		await expect.poll(() => bodyRows().count()).toBe(50);
		expect(await area().evaluate((element) => element.scrollTop)).toBe(0);
		expect(new URL(app.page.url()).searchParams.get("sort")).toBe("-number");
		expect(position()).toBeNull();
		const numbers = await completed();
		expect(await shownNumbers(app)).toEqual(numbers.toReversed().slice(0, 50));
	});

	test("the selection keeps to the rows loaded, and offers all that match", async () => {
		const { page } = app;
		// Completed and cancelled orders: more than are loaded.
		const total = formatNumber(
			await value<number>(
				`select count(*) from "order" where organization_id = ? and status in ('completed', 'cancelled')`,
				[north.id],
			),
		);
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		const selectLoaded = page.getByRole("checkbox", { name: "Select all loaded rows" });
		/** What the bar says of the selection. */
		const said = () => bar.locator("span").first().innerText();
		await app.go("/orders?status=completed,cancelled&sort=number");

		await selectLoaded.click();
		await expect.poll(said).toBe("50 selected");
		const selectAll = bar.getByRole("button", { name: `Select all ${total} matching` });
		await expect.poll(() => selectAll.count()).toBe(1);

		// More rows: those selected stay so, the new ones aren't.
		await loadMore();
		await expect.poll(said).toBe("50 selected");
		expect(await selectLoaded.getAttribute("aria-checked")).toBe("mixed");
		expect(await selectAll.count()).toBe(0);
		await selectLoaded.click();
		const loaded = await bodyRows().count();
		expect(loaded).toBeGreaterThanOrEqual(100);
		await expect.poll(said).toBe(`${loaded} selected`);

		await selectAll.click();
		await expect.poll(said).toBe(`All ${total} matching selected`);
		await bar.getByRole("button", { name: "Clear selection" }).click();
		await expect.poll(() => bar.count()).toBe(0);
	});
});
