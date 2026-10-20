/**
 * The Connect page (Components) in SHLTR, as seeded: the KPI tiles count the rows by status as the
 * database has them, the customer chips and "only what needs attention" filter the list (in the
 * URL); the legend says what the statuses mean, and the activity log shows what happened to the
 * chosen customer's units, also on its page. The dashboard's tile counts the units (their
 * components' conditions taken in) and links here. What the server lists and counts (a row per
 * component and per unit without, worst first, its filters and sorts) is `connect.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, useApp, users } from "#e2e/app.ts";

import {
	countsOf,
	pageLocators,
	type RowState,
	rowsOf,
	type UnitState,
	unitStates,
} from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const { kpis, shownStatuses, sidebarLinks } = pageLocators(app);

let units: UnitState[];
let rows: RowState[];

describe("the Connect page", () => {
	test("is in the sidebar after Equipment, and its tiles count the rows by status", async () => {
		units = await unitStates(shltr.id);
		rows = rowsOf(units);
		const counts = countsOf(rows);
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
		// The log's entry of dock 07's door's latest condition.
		await log
			.locator("[data-activity]", { hasText: "recorded the condition" })
			.filter({ hasText: "· 22%" })
			.first()
			.waitFor();
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
		expect(new Set(await shownStatuses())).toEqual(new Set(["critical", "attention"]));
		await page.getByRole("checkbox", { name: "Only what needs attention" }).click();
		await page.waitForURL((url) => !url.searchParams.has("status"));
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

	test("with a single row, the table doesn't scroll inside itself", async () => {
		// The mockup's worn spring set: its row's status has a dot and a screen reader's text,
		// positioned, which the table's hidden widest-cell rows once let hang below it.
		await app.go("/condition?q=OC-1041");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(1);
		const container = app.page.locator('[data-slot="data-table"] [data-slot="table-container"]');
		expect(await container.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(
			0,
		);
	});
});

describe("elsewhere", () => {
	test("a customer's page shows its units' activity log", async () => {
		const riedel = units.find((unit) => unit.customerName === "Riedel B.V.")!;
		await app.go(`/customers/${riedel.customer}`);
		const log = app.page.locator("[data-service-history]");
		await log.getByText("What happened to Riedel B.V.'s units lately.").waitFor();
		const entries = await log.locator("[data-activity] > p:first-child").allInnerTexts();
		expect(entries.length).toBe(10);
		expect(entries.some((entry) => /recorded the condition .+ on equipment /.test(entry))).toBe(
			true,
		);
		expect(entries.some((entry) => /completed order ORD-/.test(entry))).toBe(true);
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
