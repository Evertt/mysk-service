/**
 * Stable column widths (see `column-widths.svelte.ts`), on the orders list: paging doesn't move
 * the columns, the hidden rows that keep them wide enough are no rows to the user, and a filter
 * lays the columns out again with what the list has shown.
 */
import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { organizations, useApp } from "./app.ts";

const admin = useApp();

/** The header cells' widths, by column. */
const widths = (page: Page) =>
	page
		.locator("[data-slot=data-table] thead th")
		.evaluateAll((ths: HTMLElement[]) =>
			Object.fromEntries(ths.map((th) => [th.dataset.columnId, th.getBoundingClientRect().width])),
		);

/** The page's cells (but the pinned ones) whose contents don't fit them. */
const clipped = (page: Page) =>
	page
		.locator("[data-slot=table-body] td:not([data-pinned])")
		.evaluateAll((tds: HTMLElement[]) =>
			tds.filter((td) => td.scrollWidth > td.clientWidth + 1).map((td) => td.dataset.columnId),
		);

async function nextPage(page: Page) {
	const before = await page.locator("[data-slot=table-body] tr").first().innerText();
	await page.getByRole("button", { name: "Go to next page" }).click();
	await expect
		.poll(() => page.locator("[data-slot=table-body] tr").first().innerText())
		.not.toBe(before);
	await admin.tableSettled();
}

test("paging keeps the columns' widths", async () => {
	const { page } = admin;
	await admin.go("/orders");
	await admin.tableSettled();
	const first = await widths(page);

	for (let pageNumber = 2; pageNumber <= 4; pageNumber++) {
		await nextPage(page);
		expect(await widths(page)).toEqual(first);
	}
});

test("the hidden rows are no rows: not counted, read out or navigated", async () => {
	const { page } = admin;
	await expect
		.poll(() => page.locator("[data-slot=data-table-hidden-rows] tr").count())
		.toBeGreaterThan(0);
	expect(await page.locator("[data-slot=data-table-hidden-rows]").getAttribute("aria-hidden")).toBe(
		"true",
	);
	expect(await page.locator("[data-slot=data-table-hidden-rows]").getAttribute("inert")).toBe("");
	expect(
		await page
			.locator("[data-slot=data-table-hidden-rows]")
			.evaluate((tfoot: HTMLElement) => tfoot.offsetHeight),
	).toBe(0);
	// The header and the page's 20 rows.
	expect(await page.getByRole("row").count()).toBe(21);
	expect(await admin.rowCount()).toBeGreaterThan(20);
});

test("a filter lays the columns out again, wide enough for what the list has shown", async () => {
	const { page } = admin;
	await admin.go("/orders?status=completed");
	await admin.tableSettled();
	await expect.poll(() => page.locator("[data-slot=table]").getAttribute("data-frozen")).toBeNull();
	expect(await clipped(page)).toEqual([]);

	// The pages seen before the filter: their widest cells fit too, without moving the columns.
	// (A parameter, or the list would come back filtered, see `views.memory.test.ts`.)
	await admin.go("/orders?page=1");
	await admin.tableSettled();
	const laidOut = await widths(page);
	for (let pageNumber = 2; pageNumber <= 4; pageNumber++) {
		await nextPage(page);
		expect(await clipped(page)).toEqual([]);
		expect(await widths(page)).toEqual(laidOut);
	}
});

test("another organization's table never starts from the rows the first one kept", async () => {
	const { page } = admin;
	const { north, south } = organizations;
	/** The keys the tables' widths are kept under for the visit (see `column-widths.svelte.ts`). */
	const keys = () =>
		page.evaluate(() =>
			Object.keys(sessionStorage).filter((key) => key.startsWith("data-table-widths:")),
		);
	const before = await keys();
	expect(before.length).toBeGreaterThan(0);

	// South's orders list keeps its own, under another key: North's rows aren't laid out in it.
	await admin.switchOrganization(south.name);
	await admin.go("/orders?page=1");
	await admin.tableSettled();
	await expect
		.poll(async () => (await keys()).filter((key) => !before.includes(key)))
		.toHaveLength(1);
	expect(before.some((key) => key.includes(north.id))).toBe(true);
	expect((await keys()).filter((key) => key.includes(south.id))).toHaveLength(1);
	await admin.switchOrganization(north.name);
});
