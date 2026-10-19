/**
 * The equipment list's page: its rows and layout, the band and its category chips, a range from
 * the Filter menu, paging as it scrolls, the customer filter's search, the location filter's
 * layout, grouping across pages, a bulk action on all the loaded units, and SHLTR's units without
 * a manufacturer. What `getEquipmentList` and `getEquipmentFacets` return
 * (counts, ranges, sorting, search, another tenant's rows) is `equipment/server/list.spec.ts`'s and
 * `lists/plan.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "#lib/i18n/format.ts";

import {
	afresh,
	countIn,
	fitsWidth,
	isRemote,
	onPhone,
	organizations,
	rows,
	useApp,
	users,
	value,
} from "./app.ts";
import { equipmentPage } from "./equipment-helpers.ts";

const { north } = organizations;
const app = useApp();
const { bodyRows, shownSerials } = equipmentPage(app);

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
	await page.getByRole("option", { name: new RegExp(`^${option}\\s*[\\d,]+$`) }).click();
	await page.keyboard.press("Escape");
}

describe("in North", () => {
	// That it's exactly North's units is the list's SQL (`plan.spec.ts`, "never returns another
	// tenant's rows"); paging as it scrolls is the test of the server's pages below.
	test("the list shows North's units, 50 at a time", async () => {
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

	test("on a laptop screen a list of a few units, or none, is only as tall as they need", async () => {
		const { page } = app;
		const table = page.locator('[data-slot="data-table"]');
		/** The table's height, and how tall its rows are (the line under them included). */
		const heights = () =>
			table.evaluate((element) => ({
				table: element.getBoundingClientRect().height,
				rows: element.querySelector("table")!.getBoundingClientRect().height,
			}));
		/** How far the page scrolls (its padding under the table stays in view without). */
		const pageScrolls = () =>
			page
				.locator('[data-slot="sidebar-inset"]')
				.evaluate((element) => element.scrollHeight - element.clientHeight);
		const serial = await value<string>(
			`select serial_number from equipment where organization_id = ? order by id limit 1`,
			[north.id],
		);
		await page.setViewportSize({ width: 1440, height: 900 });
		try {
			// One unit: the table keeps its least height, 12rem, which is more than its rows need.
			await app.go(`/equipment?q=${encodeURIComponent(serial)}`);
			await expect.poll(() => bodyRows().count()).toBe(1);
			const one = await heights();
			expect(one.rows).toBeLessThan(192);
			expect(one.table).toBe(192);
			expect(await pageScrolls()).toBe(0);
			// None: the empty state, which needs more than that.
			await app.go("/equipment?q=no-such-unit-anywhere");
			await expect.poll(() => table.getByText("No equipment found").isVisible()).toBe(true);
			const none = await heights();
			expect(none.rows).toBeGreaterThan(192);
			expect(none.table).toBeCloseTo(none.rows, -1);
			expect(await pageScrolls()).toBe(0);
		} finally {
			await page.setViewportSize({ width: 1440, height: 1000 });
			// The tests below go on with the whole list.
			await app.go(afresh("/equipment"));
		}
	});

	// Searching and filtering in the database are `plan.spec.ts`'s ("searching", "filtering"); the
	// band's chips and the Status filter below go through them from the toolbar.
	test("the band counts the units listed, and its category chips set the category filter", async () => {
		const { page } = app;
		const band = page.locator("[data-toolbar-band]");
		const pill = band.locator("[data-band-count]");
		const total = await countIn("equipment", north.id);
		expect(await band.getByRole("heading", { level: 1 }).innerText()).toBe("Equipment");
		expect(await pill.innerText()).toBe(`${formatNumber(total)} units`);
		const chips = band.getByRole("group", { name: "Category" });
		// The band keeps its height above the table that fills the screen: nothing of it cut off.
		expect(await band.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
			true,
		);
		// "All" and each of North's categories with units, in its order, with their counts.
		const categories = await rows<{ id: number; name: string; units: number }>(
			`select c.id, c.name, count(e.id) as units from equipment_category c
			 join equipment e on e.category_id = c.id
			 where c.organization_id = ? group by c.id order by c.position, c.id`,
			[north.id],
		);
		/** A chip's label and count, as one line. */
		const chipText = (text: string) => text.replace(/\s+/g, " ");
		expect((await chips.getByRole("button").allInnerTexts()).map(chipText)).toEqual([
			`All ${formatNumber(total)}`,
			...categories.map((category) => `${category.name} ${formatNumber(category.units)}`),
		]);
		expect(await chips.locator('[data-chip="all"]').getAttribute("aria-pressed")).toBe("true");

		// A chip filters by its category alone, in the URL and the filter's pill.
		const [first, second] = categories;
		await chips.locator(`[data-chip="${first.id}"]`).click();
		await expect.poll(() => app.rowCount()).toBe(first.units);
		expect(new URL(page.url()).searchParams.get("category")).toBe(String(first.id));
		expect(await app.filterPill("Category").innerText()).toContain(first.name);
		expect(await pill.innerText()).toBe(`${formatNumber(first.units)} units`);
		expect(await chips.locator(`[data-chip="${first.id}"]`).getAttribute("aria-pressed")).toBe(
			"true",
		);
		// Another chip takes its place; the chosen one again, or "All", lifts the filter.
		await chips.locator(`[data-chip="${second.id}"]`).click();
		await expect.poll(() => app.rowCount()).toBe(second.units);
		await chips.locator(`[data-chip="${second.id}"]`).click();
		await expect.poll(() => app.rowCount()).toBe(total);
		expect(new URL(page.url()).searchParams.get("category")).toBeNull();
		await chips.locator(`[data-chip="${first.id}"]`).click();
		await expect.poll(() => app.rowCount()).toBe(first.units);
		await chips.locator('[data-chip="all"]').click();
		await expect.poll(() => app.rowCount()).toBe(total);
		// The other filters narrow the chips' counts (`getEquipmentFacets`, in
		// `equipment/server/list.spec.ts`).
	});

	// The other ranges, from links and combined with the other filters, and the open orders are
	// `equipment/server/list.spec.ts`'s.
	test("out of warranty, from the Filter menu: a preset that stays relative", async () => {
		const { page } = app;
		const expected = await value<number>(
			`select count(*) from equipment where organization_id = ? and warranty_until < ?`,
			[north.id, Temporal.Now.plainDateISO().toString()],
		);
		expect(expected).toBeGreaterThan(0);
		await app.go(afresh("/equipment"));
		await app.openFilter("Warranty");
		await page
			.locator('[data-slot="command-list"]')
			.getByRole("option", { name: /^Before today/ })
			.click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("warranty") === "before-today");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		expect(await app.filterPill("Warranty").innerText()).toContain("Before today");
	});

	test("the band and its chips fit a phone's screen", async () => {
		await onPhone(app.page, async () => {
			await app.go(afresh("/equipment"));
			await app.page.locator("[data-toolbar-band] [data-filter-chips]").waitFor();
			expect(await fitsWidth(app.page)).toBe(true);
		});
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

	test("filtering by customer, found by searching the filter", async () => {
		const { page } = app;
		const [owner] = await rows<{ code: string; name: string; units: number }>(
			`select c.code, c.name, count(*) as units from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? group by c.id order by units desc, c.id limit 1`,
			[north.id],
		);
		await app.go(afresh("/equipment"));
		await app.openFilter("Customer");
		// By its code, which the option doesn't show: its name, and how many units it has.
		await page.getByPlaceholder("Search customers…").fill(owner.code.toLowerCase());
		const option = page.getByRole("option").filter({ hasText: owner.name });
		expect(await option.innerText()).toMatch(new RegExp(`${owner.units}$`));
		await option.click();
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

	test("the location filter lists each location's name, whose site it's at and its units, apart", async () => {
		const { page } = app;
		await app.go(afresh("/equipment"));
		const check = async () => {
			await app.openFilter("Location");
			const options = page.getByRole("option");
			await options.nth(3).waitFor();
			const boxes = await options.evaluateAll((items: HTMLElement[]) =>
				items.slice(1, 6).map((item) => {
					const box = (element: Element | null) => {
						const rect = element!.getBoundingClientRect();
						return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
					};
					const [label, detail] = item.querySelectorAll("span.truncate");
					return {
						item: box(item),
						label: box(label),
						detail: box(detail),
						count: box(item.querySelector('[data-slot="command-shortcut"]')),
						text: (label as HTMLElement).innerText,
					};
				}),
			);
			for (const { item, label, detail, count, text } of boxes) {
				expect(text.length, "the label is shown").toBeGreaterThan(0);
				expect(label.right - label.left, text).toBeGreaterThan(20);
				// The site under the name, the count after both, all inside the option.
				expect(detail.top, text).toBeGreaterThanOrEqual(label.bottom - 1);
				expect(count.left, text).toBeGreaterThanOrEqual(Math.max(label.right, detail.right));
				expect(count.right, text).toBeLessThanOrEqual(item.right);
			}
			await page.keyboard.press("Escape");
			await page.keyboard.press("Escape");
		};
		await check();
		await onPhone(page, async () => {
			await app.go(afresh("/equipment"));
			await check();
		});
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

		/** Checks the rows shown, and gives how many there are. */
		const check = async () => {
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
			return shown.length;
		};

		// The first page, and the next across the category that goes on. The groups of the pages
		// after are `plan.spec.ts`'s ("grouping").
		const first = await check();
		await page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded();
		await expect.poll(async () => (await shownRows()).length).toBeGreaterThan(first);
		await check();
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
});

describe("in SHLTR, whose imported units may have no manufacturer", () => {
	test("the manufacturer filter offers them as “No manufacturer”", async () => {
		const { page } = app;
		await app.signIn(users.shltrPlanner);
		const without = await value<number>(
			`select count(*) from equipment where organization_id = ? and manufacturer = ''`,
			[organizations.shltr.id],
		);
		expect(without).toBeGreaterThan(0);
		await app.go(afresh("/equipment"));
		await filter("Manufacturer", "No manufacturer");
		await page.waitForURL((url) => url.searchParams.get("manufacturer") === "none");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(without);
		expect(await app.filterPill("Manufacturer").innerText()).toContain("No manufacturer");
	});
});
