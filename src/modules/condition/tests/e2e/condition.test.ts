/**
 * The Connect page in SHLTR, as seeded: the KPI tiles count the units in care by status as the
 * database has them, the customer chips and "only units that need attention" filter the list,
 * which is worst first; the legend says what the statuses mean, and the activity log shows what
 * happened to the chosen customer's units, also on its page. The dashboard's tile links here.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, useApp, users } from "#e2e/app.ts";

import { countsOf, pageLocators, rank, type UnitState, unitStates } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const { kpis, shownStatuses, sidebarLinks } = pageLocators(app);

let units: UnitState[];

describe("the Connect page", () => {
	test("is in the sidebar after Equipment, and its tiles count the units by status", async () => {
		units = await unitStates(shltr.id);
		const counts = countsOf(units);
		// The seed shows every status.
		for (const status of ["critical", "attention", "planned", "ok"] as const) {
			expect(counts[status], status).toBeGreaterThan(0);
		}
		await app.go("/");
		const links = await sidebarLinks();
		expect(links.slice(links.indexOf("Equipment") + 1)).toContain("Connect");
		await app.page
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Connect" })
			.click();
		await app.page.waitForURL((url) => url.pathname === "/condition");
		await app.tableSettled();
		expect(await kpis()).toEqual(counts);
		expect(await app.rowCount()).toBe(counts.units);
	});

	test("lists the units worst first, the critical ones on top", async () => {
		const shown = await shownStatuses();
		expect(shown.length).toBeGreaterThan(0);
		expect(shown[0]).toBe("critical");
		const ranks = shown.map((status) => rank[status as keyof typeof rank]);
		expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
	});

	test("a customer's chip shows its units, its counts and its activity log", async () => {
		const { page } = app;
		const riedel = units.find((unit) => unit.customerName === "Riedel B.V.")!;
		const theirs = units.filter((unit) => unit.customer === riedel.customer);
		await page.locator(`[data-chip="${riedel.customer}"]`).click();
		await page.waitForURL((url) => url.searchParams.get("customer") === riedel.customer);
		await app.tableSettled();
		await expect.poll(() => kpis()).toEqual(countsOf(theirs));
		expect(await app.rowCount()).toBe(theirs.length);
		// Dock 07's door, its torsion springs worn: the mockup's row.
		const door = page.locator("tbody tr", { hasText: "Sectionaaldeur laaddok 07" });
		expect(await door.locator("[data-condition]").getAttribute("data-condition")).toBe("22");
		expect(await door.innerText()).toContain(
			"Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
		);

		await page.getByRole("button", { name: "Activity log" }).click();
		const log = page.getByRole("dialog").locator("[data-service-history]");
		await log.getByText("What happened to Riedel B.V.'s units lately.").waitFor();
		await log.getByText("Condition recorded: 22%").first().waitFor();
		expect(await log.locator("[data-feed-entry]").count()).toBeGreaterThan(0);
		await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
	});

	test("only the units that need attention, when asked", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "All customers" }).click();
		await page.waitForURL((url) => !url.searchParams.has("customer"));
		await page.getByRole("checkbox", { name: "Only units that need attention" }).click();
		await page.waitForURL(
			(url) =>
				url.searchParams.get("status")?.split(",").toSorted().join() === "attention,critical",
		);
		await app.tableSettled();
		const counts = countsOf(units);
		expect(await app.rowCount()).toBe(counts.critical + counts.attention);
		expect(new Set(await shownStatuses())).toEqual(new Set(["critical", "attention"]));
		// The tiles still count every status.
		expect(await kpis()).toEqual(counts);
		await page.getByRole("checkbox", { name: "Only units that need attention" }).click();
		await page.waitForURL((url) => !url.searchParams.has("status"));
	});

	test("sorts by condition, the lowest first", async () => {
		await app.sortBy("Condition", "ascending");
		const scores = await app.page
			.locator('[data-slot="data-table"] tbody tr [data-condition]')
			.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => Number(cell.dataset.condition)));
		expect(scores.length).toBeGreaterThan(0);
		expect(scores).toEqual(scores.toSorted((a, b) => a - b));
		expect(scores[0]).toBe(Math.min(...units.flatMap((unit) => unit.score ?? [])));
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
		expect(await app.rowCount()).toBe(counts.critical + counts.attention);
	});
});
