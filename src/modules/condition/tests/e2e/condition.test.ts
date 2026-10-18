/**
 * The Connect page (Components) in SHLTR, as seeded: a row per component of a unit in care and one
 * per unit without components; the KPI tiles count the rows by status as the database has them,
 * the customer chips and "only what needs attention" filter the list, which is worst first; the
 * legend says what the statuses mean, and the activity log shows what happened to the chosen
 * customer's units, also on its page. The dashboard's tile counts the units (their components'
 * conditions taken in) and links here.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, useApp, users } from "#e2e/app.ts";

import {
	countsOf,
	pageLocators,
	rank,
	type RowState,
	rowsOf,
	type UnitState,
	unitStates,
} from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const { kpis, shownStatuses, sidebarLinks } = pageLocators(app);

/** The numbers of the mockup's 14 components, as seeded. */
const mockupComponents = [
	"OC-1041",
	"OC-1042",
	"OC-1043",
	"OC-1044",
	"OC-1045",
	"OC-2011",
	"OC-2012",
	"OC-2013",
	"OC-3007",
	"OC-3008",
	"OC-3009",
	"OC-4002",
	"OC-4003",
	"OC-4004",
];

let units: UnitState[];
let rows: RowState[];

describe("the Connect page", () => {
	test("is in the sidebar after Equipment, and its tiles count the rows by status", async () => {
		units = await unitStates(shltr.id);
		rows = rowsOf(units);
		const counts = countsOf(rows);
		// The mockup's components are there (a file that ran before on the worker may have added
		// one), and the units without components too.
		const components = rows.flatMap((row) => (row.component ? [row.component.number] : []));
		expect(components).toEqual(expect.arrayContaining(mockupComponents));
		expect(rows.length).toBe(
			units.filter((unit) => !unit.components.length).length + components.length,
		);
		// The seed shows every status.
		for (const status of ["critical", "attention", "planned", "ok"] as const) {
			expect(counts[status], status).toBeGreaterThan(0);
		}
		await app.go("/");
		const links = await sidebarLinks();
		expect(links.slice(links.indexOf("Equipment") + 1)).toContain("Components");
		await app.page
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Components" })
			.click();
		await app.page.waitForURL((url) => url.pathname === "/condition");
		await app.tableSettled();
		expect(await kpis()).toEqual(counts);
		expect(await app.rowCount()).toBe(counts.units);
	});

	test("lists the rows worst first, the critical ones on top", async () => {
		const shown = await shownStatuses();
		expect(shown.length).toBeGreaterThan(0);
		expect(shown[0]).toBe("critical");
		const ranks = shown.map((status) => rank[status as keyof typeof rank]);
		expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
	});

	test("opens with its banner and how it works in four steps, and fits a phone", async () => {
		const { page } = app;
		const banner = page.locator("[data-page-banner]");
		expect(await banner.getByRole("heading", { level: 1 }).innerText()).toBe(
			"Components per customer",
		);
		expect(await banner.innerText()).toContain("From the first sign to the completed checklist");
		expect(await page.locator("[data-steps] li").allInnerTexts()).toEqual([
			expect.stringContaining("1. Link"),
			expect.stringContaining("2. Monitor"),
			expect.stringContaining("3. Plan"),
			expect.stringContaining("4. Carry out and record"),
		]);
		await onPhone(page, async () => {
			await page.reload();
			await page.locator("[data-kpis]").waitFor();
			expect(await fitsWidth(page)).toBe(true);
		});
		await app.tableSettled();
	});

	test("a customer's chip shows its rows, its counts and its activity log", async () => {
		const { page } = app;
		const riedel = units.find((unit) => unit.customerName === "Riedel B.V.")!;
		const theirs = rows.filter((row) => row.unit.customer === riedel.customer);
		await page.locator(`[data-chip="${riedel.customer}"]`).click();
		await page.waitForURL((url) => url.searchParams.get("customer") === riedel.customer);
		await app.tableSettled();
		await expect.poll(() => kpis()).toEqual(countsOf(theirs));
		expect(await app.rowCount()).toBe(theirs.length);
		// Dock 07's door's torsion spring set, worn: the mockup's row, with its article.
		const springs = page.locator("tbody tr", { hasText: "Torsieveerpakket" });
		expect(await springs.locator("[data-condition]").getAttribute("data-condition")).toBe("22");
		const text = await springs.innerText();
		expect(text).toContain("OC-1041 · art. SD-001");
		expect(text).toContain("Sectionaaldeur laaddok 07");
		expect(text).toContain("Veerpakket vervangen (SD-001) — cyclusteller boven 90%.");
		expect(await springs.locator("[data-status]").getAttribute("data-status")).toBe("critical");
		// A unit without components is a row of its own, as a whole.
		expect(await page.locator("tbody tr", { hasText: "Whole unit" }).count()).toBeGreaterThan(0);

		await page.getByRole("button", { name: "Activity log" }).click();
		const log = page.getByRole("dialog").locator("[data-service-history]");
		await log.getByText("What happened to Riedel B.V.'s units lately.").waitFor();
		await log.getByText("Condition recorded: 22%").first().waitFor();
		expect(await log.locator("[data-feed-entry]").count()).toBeGreaterThan(0);
		await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
	});

	test("only what needs attention, when asked", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "All customers" }).click();
		await page.waitForURL((url) => !url.searchParams.has("customer"));
		await page.getByRole("checkbox", { name: "Only what needs attention" }).click();
		await page.waitForURL(
			(url) =>
				url.searchParams.get("status")?.split(",").toSorted().join() === "attention,critical",
		);
		await app.tableSettled();
		const counts = countsOf(rows);
		expect(await app.rowCount()).toBe(counts.critical + counts.attention);
		expect(new Set(await shownStatuses())).toEqual(new Set(["critical", "attention"]));
		// The tiles still count every status.
		expect(await kpis()).toEqual(counts);
		await page.getByRole("checkbox", { name: "Only what needs attention" }).click();
		await page.waitForURL((url) => !url.searchParams.has("status"));
	});

	test("sorts by condition, the lowest first", async () => {
		await app.sortBy("Condition", "ascending");
		const scores = await app.page
			.locator('[data-slot="data-table"] tbody tr [data-condition]')
			.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => Number(cell.dataset.condition)));
		expect(scores.length).toBeGreaterThan(0);
		expect(scores).toEqual(scores.toSorted((a, b) => a - b));
		expect(scores[0]).toBe(Math.min(...rows.flatMap((row) => row.score ?? [])));
	});

	test("says what the statuses mean", async () => {
		const { page } = app;
		await page.getByText("What do the statuses mean?").click();
		const legend = page.locator("[data-status-legend]");
		await legend
			.getByText("Condition below 40% or inspection expired — plan within 5 working days.")
			.waitFor();
		expect(await legend.innerText()).toContain("Within interval and inspection valid — no action.");
	});
});

describe("elsewhere", () => {
	test("a customer's page shows its units' activity log", async () => {
		const riedel = units.find((unit) => unit.customerName === "Riedel B.V.")!;
		await app.go(`/customers/${riedel.customer}`);
		const log = app.page.locator("[data-service-history]");
		await log.getByText("What happened to Riedel B.V.'s units lately.").waitFor();
		const kinds = await log
			.locator("[data-feed-entry]")
			.evaluateAll((entries: HTMLElement[]) => entries.map((entry) => entry.dataset.feedEntry));
		expect(kinds.length).toBe(10);
		expect(kinds).toContain("condition");
		expect(kinds).toContain("order");
	});

	test("the dashboard's tile counts the units that need attention, and links to them", async () => {
		const { page } = app;
		// The units, their components' conditions taken in.
		const counts = countsOf(units);
		await app.go("/");
		const tile = page.locator("[data-condition-stat]");
		await tile.waitFor();
		expect(await tile.innerText()).toContain(
			`${counts.critical} critical · ${counts.attention} attention`,
		);
		await tile.getByRole("link", { name: "View" }).click();
		await page.waitForURL((url) => url.pathname === "/condition");
		await app.tableSettled();
		// The rows that do: the components that do, and the units without components that do.
		const rowCounts = countsOf(rows);
		expect(await app.rowCount()).toBe(rowCounts.critical + rowCounts.attention);
	});
});
