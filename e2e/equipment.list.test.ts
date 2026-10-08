import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "../src/lib/format.ts";
import { countIn, isRemote, organizations, rows, useApp, value } from "./app.ts";
import { busiest, equipmentPage, serialsIn, unit } from "./equipment-helpers.ts";
import { remoteErrorStatus, tamperWithCommand, tamperWithQuery } from "./remote-functions.ts";

const { north } = organizations;
const app = useApp();
const { bodyRows, listedSerials, shownSerials } = equipmentPage(app);

/** The shown page's rows: a group's row as `group:<category>`, a unit's as its serial number. */
const shownRows = () =>
	bodyRows().evaluateAll((trs: HTMLElement[]) =>
		trs.map((tr) =>
			tr.dataset.group === undefined
				? decodeURIComponent(
						tr.querySelector('a[href^="/equipment/"]')!.getAttribute("href")!.split("/")[2],
					)
				: `group:${tr.dataset.group}`,
		),
	);

/** Opens a faceted filter of the toolbar and picks one of its options. */
async function filter(title: string, option: string) {
	const { page } = app;
	await page.getByRole("button", { name: title, exact: true }).first().click();
	await page.getByRole("option", { name: new RegExp(`^${option}\\s*\\d+$`) }).click();
	await page.keyboard.press("Escape");
}

const count = (where: string, args: (string | number)[] = []) =>
	value<number>(`select count(*) from equipment where organization_id = ? and ${where}`, [
		north.id,
		...args,
	]);

describe("in North", () => {
	test("the list shows exactly North's units, 20 per page", async () => {
		expect(await listedSerials()).toEqual(await serialsIn(north.id));
		await app.go("/equipment");
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
		expect(await bodyRows().count()).toBe(20);
	});

	test("on a laptop screen the list fits it, its rows scrolling under the header", async () => {
		const { page } = app;
		await page.setViewportSize({ width: 1440, height: 900 });
		try {
			await app.go("/equipment");
			expect(await bodyRows().count()).toBe(20);
			const pagination = await page.getByRole("button", { name: "Go to next page" }).boundingBox();
			expect(pagination!.y + pagination!.height).toBeLessThanOrEqual(900);
			expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);

			const area = page.locator('[data-slot="data-table"] [data-slot="table-container"]');
			const header = page.getByRole("columnheader", { name: "Unit" });
			const top = (await area.boundingBox())!.y;
			await area.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
			await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
			expect((await header.boundingBox())!.y).toBeCloseTo(top, 0);
			// Nothing covers it: it's what's at its place on the screen.
			const box = (await header.boundingBox())!;
			expect(
				await page.evaluate(
					({ x, y }) => document.elementFromPoint(x, y)?.closest("th")?.textContent?.trim(),
					{ x: box.x + 8, y: box.y + box.height / 2 },
				),
			).toMatch(/^Unit\b/);
			// And the pagination is still in view.
			expect(await page.getByRole("button", { name: "Go to next page" }).boundingBox()).toEqual(
				pagination,
			);
		} finally {
			await page.setViewportSize({ width: 1440, height: 1000 });
		}
	});

	test("searching finds a unit by its serial number, case-insensitively", async () => {
		const { page } = app;
		const { serial: busy } = await busiest(north.id);
		const search = page.getByLabel("Search equipment…");
		await search.fill(busy.toLowerCase());
		await expect.poll(() => shownSerials()).toEqual([busy]);
		await search.fill("");
		await expect.poll(() => bodyRows().count()).toBe(20);
	});

	test("filtering by category, status and manufacturer", async () => {
		const { page } = app;
		const reset = async () => {
			await page.getByRole("button", { name: "Reset" }).click();
			await expect.poll(() => app.rowCount()).toBe(await countIn("equipment", north.id));
		};

		await filter("Category", "Chiller");
		await expect.poll(() => app.rowCount()).toBe(await count(`category = 'chiller'`));
		const chillers = await bodyRows().allInnerTexts();
		expect(chillers.length).toBeGreaterThan(0);
		expect(chillers.every((row) => row.includes("Chiller"))).toBe(true);
		await reset();

		await filter("Status", "Operational");
		await expect.poll(() => app.rowCount()).toBe(await count(`status = 'operational'`));
		const operational = await bodyRows().allInnerTexts();
		expect(operational.length).toBeGreaterThan(0);
		expect(operational.every((row) => row.includes("Operational"))).toBe(true);
		await reset();

		// A hidden column: the unit column shows it.
		const manufacturer = await value<string>(
			`select manufacturer from equipment where organization_id = ?
			 group by manufacturer order by count(*) desc, manufacturer limit 1`,
			[north.id],
		);
		await filter("Manufacturer", manufacturer);
		await expect.poll(() => app.rowCount()).toBe(await count(`manufacturer = ?`, [manufacturer]));
		const made = await bodyRows().allInnerTexts();
		expect(made.length).toBeGreaterThan(0);
		expect(made.every((row) => row.includes(manufacturer))).toBe(true);
		await reset();
	});

	test("sorting by warranty, paging, and sorting by open orders", async () => {
		const { page } = app;
		// The warranty cell's date is followed by its covered/expired badge.
		const warranties = () =>
			bodyRows()
				.locator("time")
				.evaluateAll((times) =>
					times
						.filter((time) => time.nextElementSibling)
						.map((time) => time.getAttribute("datetime")!),
				);

		await app.sortBy("Warranty", "ascending");
		const ascending = await warranties();
		expect(ascending).toHaveLength(20);
		expect(ascending).toEqual([...ascending].sort());
		await app.sortBy("Warranty", "descending");
		const descending = await warranties();
		expect(descending).toEqual([...descending].sort().reverse());
		const first = await bodyRows().first().innerText();
		expect(first).toMatch(/Covered|Expired/);

		await page.getByRole("button", { name: "Go to next page" }).click();
		await app.tableSettled();
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toMatch(/^Page 2 of/);
		expect(await bodyRows().first().innerText()).not.toBe(first);

		const busiest = await rows<{ serial: string }>(
			`with open as (
				select e.serial_number as serial, count(*) as n from equipment e
				join "order" o on o.equipment_id = e.id
				where e.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
				group by e.id
			)
			select serial from open where n = (select max(n) from open)`,
			[north.id],
		);
		await app.sortBy("Open orders", "descending");
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toMatch(/^Page 1 of/);
		const [top] = await shownSerials();
		expect(busiest.map((row) => row.serial)).toContain(top);
	});

	test("the server sends one page at a time", async () => {
		const { page } = app;
		const total = await countIn("equipment", north.id);
		const second = await rows<{ serial: string }>(
			`select serial_number as serial from equipment where organization_id = ?
			 order by manufacturer collate nocase, model collate nocase, id limit 20 offset 20`,
			[north.id],
		);
		await app.go("/equipment");
		const [response] = await Promise.all([
			page.waitForResponse((r) => isRemote(r.url(), "getEquipmentList")),
			page.getByRole("button", { name: "Go to next page" }).click(),
		]);
		// Twenty units came, not all of them.
		expect((await response.text()).split("serialNumber").length - 1).toBe(20);
		await app.tableSettled();
		expect(await shownSerials()).toEqual(second.map((row) => row.serial));
		expect(await app.rowCount()).toBe(total);
	});

	test("a malformed query for the list is refused with a 400", async () => {
		const { page } = app;
		type Query = Record<string, unknown>;
		/** The error status of the response to the next `name` request, with its argument changed. */
		const statusOf = async (
			name: string,
			change: (arg: Query) => Query,
			trigger: () => unknown,
		) => {
			await app.go("/equipment");
			await tamperWithQuery<Query>(page, name, change);
			const [response] = await app.expectingErrors(() =>
				Promise.all([page.waitForResponse((r) => isRemote(r.url(), name)), trigger()]),
			);
			return remoteErrorStatus(response);
		};
		const nextPage = () => page.getByRole("button", { name: "Go to next page" }).click();
		const search = () => page.getByLabel("Search equipment…").fill("A");

		// An unknown category, a filter the list doesn't have, a number for a customer's code, a
		// page size it doesn't offer.
		const rowsWith = (change: Query) => (arg: Query) => ({ ...arg, ...change });
		for (const change of [
			{ filters: { category: ["bogus"] } },
			{ filters: { total: [1] } },
			{ filters: { customer: [1] } },
			{ pageSize: 5000 },
		]) {
			expect(
				await statusOf("getEquipmentList", rowsWith(change), nextPage),
				JSON.stringify(change),
			).toBe(400);
		}
		// The counts in the filters take the same care.
		expect(
			await statusOf("getEquipmentFacets", rowsWith({ filters: { status: ["bogus"] } }), search),
		).toBe(400);

		// The list works as before once the request is right.
		await app.go("/equipment");
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
	});

	test("filtering by customer, found by searching the filter", async () => {
		const { page } = app;
		const [owner] = await rows<{ code: string; name: string; units: number }>(
			`select c.code, c.name, count(*) as units from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? group by c.id order by units desc, c.id limit 1`,
			[north.id],
		);
		await app.go("/equipment");
		await page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" }).click();
		await page.getByPlaceholder("Search customers…").fill(owner.code.toLowerCase());
		await page.getByRole("option", { name: new RegExp(owner.code) }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("customer") === owner.code);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(owner.units);
		for (const row of await bodyRows().allInnerTexts()) expect(row).toContain(owner.code);
		expect(
			await page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" }).innerText(),
		).toContain(owner.name);
		await page.getByRole("button", { name: "Reset" }).click();
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
	});

	test("grouped by category, each category is counted whole and kept together across pages", async () => {
		const { page } = app;
		await app.go("/equipment");
		await filter("Status", "Operational");
		await app.tableSettled();
		await app.groupBy("Category");
		const params = () => new URL(page.url()).searchParams;
		expect(params().get("group")).toBe("category");
		expect(params().get("status")).toBe("operational");

		// The order the server sorts in: by category first, then by unit, as the list is sorted.
		const expected = await rows<{ serial: string; category: string }>(
			`select serial_number as serial, category from equipment
			 where organization_id = ? and status = 'operational'
			 order by category, manufacturer collate nocase, model collate nocase, id`,
			[north.id],
		);
		const categoryOf = new Map(expected.map((unit) => [unit.serial, unit.category]));
		const counts: Record<string, number> = {};
		for (const unit of expected) counts[unit.category] = (counts[unit.category] ?? 0) + 1;
		// Some category goes on from one page of 20 onto the next.
		expect(
			expected.some(
				(unit, i) => i % 20 === 0 && i > 0 && expected[i - 1].category === unit.category,
			),
		).toBe(true);

		const listed: string[] = [];
		for (;;) {
			const shown = await shownRows();
			const groups = await app.groups();
			expect(shown[0]).toMatch(/^group:/);
			// Each group counts its units on every page, under the filter.
			for (const group of groups) expect(group.count, group.key).toBe(counts[group.key]);
			// Each unit is under its category, and a category's units are together.
			let current = "";
			for (const row of shown) {
				if (row.startsWith("group:")) current = row.slice("group:".length);
				else expect(categoryOf.get(row), row).toBe(current);
			}
			const units = shown.filter((row) => !row.startsWith("group:"));
			expect(groups.map((group) => group.key)).toEqual([
				...new Set(units.map((serial) => categoryOf.get(serial))),
			]);
			// A category cut off by the page says so.
			const start = listed.length;
			const end = start + units.length;
			expect(groups[0].continued).toBe(start > 0 && expected[start - 1].category === groups[0].key);
			expect(groups.at(-1)!.continues).toBe(
				end < expected.length && expected[end].category === groups.at(-1)!.key,
			);
			listed.push(...units);

			const next = page.getByRole("button", { name: "Go to next page" });
			if (await next.isDisabled()) break;
			await next.click();
			await app.tableSettled();
		}
		expect(listed).toEqual(expected.map((unit) => unit.serial));

		// A reload keeps it grouped.
		await app.go(`/equipment${new URL(page.url()).search}`);
		expect(params().get("group")).toBe("category");
		expect((await app.groups()).length).toBeGreaterThan(0);

		await app.groupBy("None");
		expect(params().has("group")).toBe(false);
		expect(await page.locator("tbody tr[data-group]").count()).toBe(0);
		await page.getByRole("button", { name: "Reset" }).click();
		await app.tableSettled();
	});

	test("selecting all the matching units acts on exactly the filtered ones", async () => {
		const { page } = app;
		// More than fit on a page.
		const generators = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? and category = 'generator'`,
			[north.id],
		);
		expect(generators.length).toBeGreaterThan(20);
		const matching = new Set(generators.map((unit) => unit.id));
		/** Every unit of every organization with its status. */
		const statuses = () =>
			rows<{ id: number; status: string }>(`select id, status from equipment order by id`);
		const before = await statuses();
		expect(before.some((unit) => matching.has(unit.id) && unit.status !== "out_of_service")).toBe(
			true,
		);
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });

		await app.go("/equipment?category=generator&sort=serial");
		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		const total = formatNumber(generators.length);
		await bar.getByRole("button", { name: `Select all ${total} matching` }).click();
		await bar.getByText(`All ${total} matching selected`).waitFor();
		await bar.getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByLabel("Status").selectOption({ label: "Out of service" });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast(`${total} updated`);

		// The generators of North, all of them, and nothing else (not even South's).
		expect(await statuses()).toEqual(
			before.map((unit) => (matching.has(unit.id) ? { ...unit, status: "out_of_service" } : unit)),
		);
	});

	test("a bulk action with a malformed target is refused with a 400", async () => {
		const { page } = app;
		const [first] = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? and status = 'operational'
			 order by serial_number limit 1`,
			[north.id],
		);
		const before = await unit(first.id);
		await app.go("/equipment?status=operational&sort=serial");
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		await bodyRows().first().getByRole("checkbox").click();
		await bar.getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByLabel("Status").selectOption({ label: "Decommissioned" });
		// The command goes out with a filter that doesn't exist, instead of the selected unit.
		await tamperWithCommand<{ status: string }>(page, "bulkSetEquipmentStatus", (arg) => ({
			...arg,
			target: { matching: { q: "", filters: { category: ["bogus"] } } },
		}));
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "bulkSetEquipmentStatus")),
				dialog.getByRole("button", { name: "Apply" }).click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(400);
		expect(await unit(first.id)).toEqual(before);
		await page.keyboard.press("Escape");
	});
});
