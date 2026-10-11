import { describe, expect, test } from "vite-plus/test";

import { cents, organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const statusValues = ["quote", "scheduled", "in_progress", "completed", "invoiced", "cancelled"];
const equipmentStatuses = ["operational", "needs_service", "out_of_service", "decommissioned"];

/** The card of a chart. */
const chartCard = (title: string) => app.page.locator('[data-slot="card"]', { hasText: title });

/** A chart's visually hidden table, as rows of cell texts (the row header first). */
async function chartTable(title: string) {
	const trs = await chartCard(title).locator('[data-slot="chart-table"] tbody tr').all();
	return Promise.all(trs.map((tr) => tr.locator("th, td").allInnerTexts()));
}

/** An organization's orders made this week (Monday to now), by status, as the chart groups them. */
const ordersThisWeek = (organizationId: string) =>
	rows<{ status: string; count: number }>(
		`select status, count(*) as count from "order" where organization_id = ?
		 and date(created_at, 'unixepoch', 'localtime', '-6 days', 'weekday 1')
		   = date('now', 'localtime', '-6 days', 'weekday 1')
		 group by status`,
		[organizationId],
	);

/** An organization's completed and invoiced orders of this month. */
const completedThisMonth = (organizationId: string) =>
	value<number>(
		`select count(*) from "order" where organization_id = ?
		 and status in ('completed', 'invoiced')
		 and strftime('%Y-%m', completed_at, 'unixepoch', 'localtime') = strftime('%Y-%m', 'now', 'localtime')`,
		[organizationId],
	);

/** An organization's equipment per status, in the order the chart lists them. */
const equipmentByStatus = (organizationId: string) =>
	Promise.all(
		equipmentStatuses.map((status) =>
			value<number>(`select count(*) from equipment where organization_id = ? and status = ?`, [
				organizationId,
				status,
			]),
		),
	);

/** Checks the three charts' numbers against the organization's rows. */
async function expectChartsOf(organizationId: string) {
	const weeks = await chartTable("Orders per week");
	expect(weeks).toHaveLength(12);
	const thisWeek = await ordersThisWeek(organizationId);
	expect(weeks.at(-1)!.slice(1)).toEqual(
		statusValues.map((status) => String(thisWeek.find((row) => row.status === status)?.count ?? 0)),
	);

	const months = await chartTable("Revenue per month");
	expect(months).toHaveLength(12);
	expect(months.at(-1)![2]).toBe(String(await completedThisMonth(organizationId)));

	const equipment = await chartTable("Equipment by status");
	expect(equipment.map((row) => row[0])).toEqual([
		"Operational",
		"Needs service",
		"Out of service",
		"Decommissioned",
	]);
	expect(equipment.map((row) => row[1])).toEqual(
		(await equipmentByStatus(organizationId)).map(String),
	);
}

describe("the dashboard's charts", () => {
	test("show North's orders per week, revenue per month and equipment by status", async () => {
		await app.go("/");
		expect(
			await chartCard("Orders per week")
				.locator('[data-slot="chart-table"] thead th')
				.allInnerTexts(),
		).toEqual(["Week", "Quote", "Scheduled", "In progress", "Completed", "Invoiced", "Cancelled"]);
		await expectChartsOf(north.id);
	});

	test("price the revenue like the tile, so the year adds up to at least the last 30 days", async () => {
		const tile = app.page.locator('[data-slot="card"]', { hasText: "Revenue, last 30 days" });
		const last30Days = cents(await tile.locator('[data-slot="card-title"]').innerText());
		const months = await chartTable("Revenue per month");
		expect(months.at(-1)![1]).toMatch(/^€[\d,]+\.\d\d$/);
		const year = months.reduce((sum, row) => sum + cents(row[1]), 0);
		expect(year).toBeGreaterThanOrEqual(last30Days);
		expect(last30Days).toBeGreaterThan(0);
	});

	test("draw the charts, hidden from assistive technology: a bar per equipment status", async () => {
		const chart = chartCard("Equipment by status").locator('[data-slot="chart"]');
		expect(await chart.getAttribute("aria-hidden")).toBe("true");
		await expect.poll(() => chart.locator(".lc-bars-bar").count()).toBe(4);
	});

	test("show South its own numbers only", async () => {
		await app.switchOrganization(south.name);
		await expectChartsOf(south.id);
		expect(await equipmentByStatus(south.id)).not.toEqual(await equipmentByStatus(north.id));
		await app.switchOrganization(north.name);
	});
});
