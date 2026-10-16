import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "#lib/i18n/format.ts";

import { afresh, countIn, isRemote, organizations, rows, useApp, value } from "./app.ts";
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
	await app.openFilter(title);
	await page.getByRole("option", { name: new RegExp(`^${option}\\s*\\d+$`) }).click();
	await page.keyboard.press("Escape");
}

const count = (where: string, args: (string | number)[] = []) =>
	value<number>(`select count(*) from equipment where organization_id = ? and ${where}`, [
		north.id,
		...args,
	]);

describe("in North", () => {
	test("the list shows exactly North's units, 50 at a time as it scrolls", async () => {
		expect(await listedSerials()).toEqual(await serialsIn(north.id));
		await app.go(afresh("/equipment"));
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
		expect(await bodyRows().count()).toBe(50);
	});

	test("on a laptop screen the list fits it, its rows scrolling under the header", async () => {
		const { page } = app;
		await page.setViewportSize({ width: 1440, height: 900 });
		try {
			await app.go(afresh("/equipment"));
			expect(await bodyRows().count()).toBe(50);
			const table = await page.locator('[data-slot="data-table"]').boundingBox();
			expect(table!.y + table!.height).toBeLessThanOrEqual(900);
			expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);

			const area = page.locator('[data-slot="data-table"] [data-slot="table-container"]');
			const header = page.getByRole("columnheader", { name: "Unit" });
			const top = (await area.boundingBox())!.y;
			await area.evaluate((element) => element.scrollTo({ top: element.scrollHeight / 2 }));
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
			// And the table's bottom edge is still in view.
			expect(await page.locator('[data-slot="data-table"]').boundingBox()).toEqual(table);
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
		await expect.poll(() => bodyRows().count()).toBe(50);
	});

	test("filtering by category, status and manufacturer", async () => {
		const { page } = app;
		const reset = async () => {
			await page.getByRole("button", { name: "Reset" }).click();
			await expect.poll(() => app.rowCount()).toBe(await countIn("equipment", north.id));
		};

		// North's own categories, by the names it gave them.
		await filter("Category", "Koelmachine");
		await expect
			.poll(() => app.rowCount())
			.toBe(
				await count(
					`category_id = (select id from equipment_category where organization_id = ? and name = ?)`,
					[north.id, "Koelmachine"],
				),
			);
		const chillers = await bodyRows().allInnerTexts();
		expect(chillers.length).toBeGreaterThan(0);
		expect(chillers.every((row) => row.includes("Koelmachine"))).toBe(true);
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

	test("sorting by warranty, and by open orders", async () => {
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
		expect(ascending).toHaveLength(50);
		expect(ascending).toEqual([...ascending].sort());
		await app.sortBy("Warranty", "descending");
		const descending = await warranties();
		expect(descending).toEqual([...descending].sort().reverse());
		const first = await bodyRows().first().innerText();
		expect(first).toMatch(/Covered|Expired/);

		const busiest = await rows<{ serial: string }>(
			`with open as (
				select e.serial_number as serial, count(*) as n from equipment e
				join order_unit ou on ou.equipment_id = e.id join "order" o on o.id = ou.order_id
				where e.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
				group by e.id
			)
			select serial from open where n = (select max(n) from open)`,
			[north.id],
		);
		await app.sortBy("Open orders", "descending");
		const [top] = await shownSerials();
		expect(busiest.map((row) => row.serial)).toContain(top);
	});

	test("the server sends a page at a time, as the table scrolls", async () => {
		const { page } = app;
		const total = await countIn("equipment", north.id);
		const first = await rows<{ serial: string }>(
			`select serial_number as serial from equipment where organization_id = ?
			 order by manufacturer collate nocase, model collate nocase, id limit 100`,
			[north.id],
		);
		await app.go(afresh("/equipment"));
		const [response] = await Promise.all([
			page.waitForResponse((r) => isRemote(r.url(), "getEquipmentList")),
			page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded(),
		]);
		// Fifty units came, not all of them.
		expect((await response.text()).split("serialNumber").length - 1).toBe(50);
		await expect.poll(() => shownSerials()).toEqual(first.map((row) => row.serial));
		expect(await app.rowCount()).toBe(total);
	});

	// One test per request, each loading the page afresh: in one test, the six page loads took up
	// half its time under the load of a full run.
	describe("a malformed query for the list is refused with a 400", () => {
		type Query = Record<string, unknown>;
		/** The error status of the response to the next `name` request, with its argument changed. */
		const statusOf = async (
			name: string,
			change: (arg: Query) => Query,
			trigger: () => unknown,
		) => {
			await app.go(afresh("/equipment"));
			await tamperWithQuery<Query>(app.page, name, change);
			const [response] = await app.expectingErrors(() =>
				Promise.all([app.page.waitForResponse((r) => isRemote(r.url(), name)), trigger()]),
			);
			return remoteErrorStatus(response);
		};
		const rowsWith = (change: Query) => (arg: Query) => ({ ...arg, ...change });

		// An unknown category, a filter the list doesn't have, a number for a customer's code, a
		// page size it doesn't offer.
		test.each<Query>([
			{ filters: { category: ["bogus"] } },
			{ filters: { total: [1] } },
			{ filters: { customer: [1] } },
			{ pageSize: 5000 },
		])("in the rows' query: %j", async (change) => {
			const more = () => app.page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded();
			expect(await statusOf("getEquipmentList", rowsWith(change), more)).toBe(400);
		});

		test("in the filters' counts", async () => {
			const search = () => app.page.getByLabel("Search equipment…").fill("A");
			expect(
				await statusOf("getEquipmentFacets", rowsWith({ filters: { status: ["bogus"] } }), search),
			).toBe(400);
		});

		test("while the list works as before once the request is right", async () => {
			await app.go(afresh("/equipment"));
			expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
		});
	});

	test("filtering by customer, found by searching the filter", async () => {
		const { page } = app;
		const [owner] = await rows<{ code: string; name: string; units: number }>(
			`select c.code, c.name, count(*) as units from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? group by c.id order by units desc, c.id limit 1`,
			[north.id],
		);
		await app.go(afresh("/equipment"));
		await app.openFilter("Customer");
		await page.getByPlaceholder("Search customers…").fill(owner.code.toLowerCase());
		await page.getByRole("option", { name: new RegExp(owner.code) }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("customer") === owner.code);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(owner.units);
		for (const row of await bodyRows().allInnerTexts()) expect(row).toContain(owner.code);
		expect(await app.filterPill("Customer").innerText()).toContain(owner.name);
		await page.getByRole("button", { name: "Reset" }).click();
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
	});

	test("grouped by category, each category is counted whole and kept together as more rows load", async () => {
		const { page } = app;
		await app.go(afresh("/equipment"));
		await filter("Status", "Operational");
		await app.tableSettled();
		await app.groupBy("Category");
		const params = () => new URL(page.url()).searchParams;
		expect(params().get("group")).toBe("category");
		expect(params().get("status")).toBe("operational");

		// The order the server sorts in: by category first, in North's order of them, then by unit,
		// as the list is sorted. Grouped by the category's id.
		const expected = await rows<{ serial: string; category: string }>(
			`select e.serial_number as serial, cast(e.category_id as text) as category
			 from equipment e join equipment_category c on c.id = e.category_id
			 where e.organization_id = ? and e.status = 'operational'
			 order by c.position, c.id, e.manufacturer collate nocase, e.model collate nocase, e.id`,
			[north.id],
		);
		const categoryOf = new Map(expected.map((unit) => [unit.serial, unit.category]));
		const counts: Record<string, number> = {};
		for (const unit of expected) counts[unit.category] = (counts[unit.category] ?? 0) + 1;
		// Some category goes on from the first fifty rows into the next.
		expect(expected.length).toBeGreaterThan(50);
		expect(expected[49].category).toBe(expected[50].category);

		let listed: string[] = [];
		for (;;) {
			const shown = await shownRows();
			const groups = await app.groups();
			expect(shown[0]).toMatch(/^group:/);
			// Each group counts all its units, loaded or not, under the filter.
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
			// The rows load from the first on; a category cut off where they end says so.
			expect(units).toEqual(expected.slice(0, units.length).map((unit) => unit.serial));
			expect(groups[0].continued).toBe(false);
			expect(groups.at(-1)!.continues).toBe(
				units.length < expected.length && expected[units.length].category === groups.at(-1)!.key,
			);
			listed = units;

			const more = page.locator('[data-slot="data-table-more"]');
			if (!(await more.count()) || (await more.innerText()).includes("End of the list")) break;
			await more.scrollIntoViewIfNeeded();
			await expect.poll(async () => (await shownRows()).length).toBeGreaterThan(shown.length);
		}
		expect(listed).toEqual(expected.map((unit) => unit.serial));
	});

	// A test of its own: the one above loads every row, which took up half its time under the load
	// of a full run.
	test("a reload keeps it grouped, and it can be ungrouped", async () => {
		const { page } = app;
		const params = () => new URL(page.url()).searchParams;
		await app.go("/equipment?status=operational&group=category");
		expect(params().get("group")).toBe("category");
		expect((await app.groups()).length).toBeGreaterThan(0);

		await app.groupBy("None");
		await expect.poll(() => params().has("group")).toBe(false);
		expect(await page.locator("tbody tr[data-group]").count()).toBe(0);
		await page.getByRole("button", { name: "Reset" }).click();
		await app.tableSettled();
	});

	test("selecting all the loaded units acts on exactly the filtered ones", async () => {
		const { page } = app;
		// Fewer than a page of rows: all of them load at once.
		const generator = await value<number>(
			`select id from equipment_category where organization_id = ? and name = 'Aggregaat'`,
			[north.id],
		);
		const generators = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? and category_id = ?`,
			[north.id, generator],
		);
		expect(generators.length).toBeGreaterThan(20);
		expect(generators.length).toBeLessThanOrEqual(50);
		const matching = new Set(generators.map((unit) => unit.id));
		/** Every unit of every organization with its status. */
		const statuses = () =>
			rows<{ id: number; status: string }>(`select id, status from equipment order by id`);
		const before = await statuses();
		expect(before.some((unit) => matching.has(unit.id) && unit.status !== "out_of_service")).toBe(
			true,
		);
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });

		await app.go(`/equipment?category=${generator}&sort=serial`);
		await page.getByRole("checkbox", { name: "Select all loaded rows" }).click();
		const total = formatNumber(generators.length);
		// They're all loaded, so selecting them all is all that match: nothing more to offer.
		await bar.getByText(`${total} selected`, { exact: true }).waitFor();
		expect(await bar.getByRole("button", { name: /^Select all \d+ matching$/ }).count()).toBe(0);
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
