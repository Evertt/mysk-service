import { describe, expect, test } from "vite-plus/test";

import { cents, fitsWidth, onPhone, organizations, quiet, rows, useApp, value } from "./app.ts";
import { addUnits } from "./orders-helpers.ts";

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

	test("fit a phone's screen, their hidden tables too", async () => {
		await onPhone(app.page, async () => {
			await app.go("/");
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	test("show South its own numbers only", async () => {
		await app.switchOrganization(south.name);
		await expectChartsOf(south.id);
		expect(await equipmentByStatus(south.id)).not.toEqual(await equipmentByStatus(north.id));
		await app.switchOrganization(north.name);
	});
});

type Box = { title: string; left: number; top: number; right: number; bottom: number };

/** The boxes of the dashboard's cards (the masonry's items), with their titles, in page order. */
const cardBoxes = () =>
	app.page.locator("[data-dashboard-cards]").evaluate((container): Box[] => {
		const items = (element: Element): Element[] =>
			[...element.children].flatMap((child) =>
				getComputedStyle(child).display === "contents" ? items(child) : [child],
			);
		return items(container).map((card) => {
			const { left, top, right, bottom } = card.getBoundingClientRect();
			const title = card.querySelector('[data-slot="card-title"]')?.textContent?.trim() ?? "";
			return { title, left, top, right, bottom };
		});
	});

/** Checks that no two cards overlap (by more than a pixel's rounding). */
function expectApart(boxes: Box[]) {
	for (const [index, a] of boxes.entries()) {
		for (const b of boxes.slice(index + 1)) {
			const overlap =
				a.left < b.right - 1 &&
				b.left < a.right - 1 &&
				a.top < b.bottom - 1 &&
				b.top < a.bottom - 1;
			expect(overlap, `${a.title} overlaps ${b.title}`).toBe(false);
		}
	}
}

/** The cards' columns: their left edges. */
const columnsOf = (boxes: Box[]) => new Set(boxes.map((box) => Math.round(box.left)));

/** The dashboard, once its cards are packed into columns. */
async function packedDashboard() {
	await app.go("/");
	await expect.poll(() => app.page.locator("[data-dashboard-cards][data-masonry]").count()).toBe(1);
	return cardBoxes();
}

describe("the dashboard's cards", () => {
	test("pack into three columns on a wide screen, the modules' cards each on its own", async () => {
		const boxes = await packedDashboard();
		expect(boxes.map((box) => box.title)).toEqual([
			"Upcoming work",
			"Equipment by status",
			"Revenue per month",
			"Orders per week",
			"Response times at risk",
			"Contracts ending soon",
			"Receivables",
			"Overdue invoices",
			"Maintenance plans",
			`Partner programme ${new Date().getFullYear()}`,
			"Recent activity",
		]);
		expect(columnsOf(boxes).size).toBe(3);
		// The first row reads left to right in the page's order: the upcoming work, two columns
		// wide, then the equipment beside it.
		const [first, second] = boxes;
		expect(first.left).toBeLessThan(second.left);
		expect(first.right - first.left).toBeGreaterThan(second.right - second.left);
		expectApart(boxes);
	});

	test("stack in one column on a phone, without scrolling sideways", async () => {
		await onPhone(app.page, async () => {
			await app.go("/");
			expect(await app.page.locator("[data-dashboard-cards][data-masonry]").count()).toBe(0);
			const boxes = await cardBoxes();
			expect(columnsOf(boxes).size).toBe(1);
			expectApart(boxes);
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	test("pack South's, which has fewer modules, the same way", async () => {
		await app.switchOrganization(south.name);
		const boxes = await packedDashboard();
		expect(boxes.map((box) => box.title)).toEqual([
			"Upcoming work",
			"Equipment by status",
			"Revenue per month",
			"Orders per week",
			"Receivables",
			"Overdue invoices",
			"Recent activity",
		]);
		expect(columnsOf(boxes).size).toBe(3);
		expectApart(boxes);
		await app.switchOrganization(north.name);
	});
});

/** The upcoming work's rows: each order's number and what its units cell reads. */
async function upcomingWork(): Promise<[string, string][]> {
	const card = app.page.locator('[data-slot="card"]', { hasText: "Upcoming work" });
	await card.getByRole("columnheader", { name: "Equipment" }).waitFor();
	return card
		.locator("tbody tr")
		.evaluateAll((trs) =>
			trs.map((tr): [string, string] => [
				tr.querySelector("td")!.textContent!.trim(),
				tr.querySelector("[data-units]")!.textContent!.trim(),
			]),
		);
}

/** What the units cell should read for an order: its first unit, "+N" for the rest. */
async function unitsOf(number: string) {
	const units = await rows<{ name: string | null; manufacturer: string; model: string }>(
		`select e.name, e.manufacturer, e.model from order_unit u
		 join "order" o on o.id = u.order_id join equipment e on e.id = u.equipment_id
		 where o.number = ? and o.organization_id = ? order by u.position`,
		[number, north.id],
	);
	if (!units.length) return "New installation";
	const [first] = units;
	const title = first.name ?? `${first.manufacturer} ${first.model}`;
	return units.length > 1 ? `${title} +${units.length - 1}` : title;
}

describe("the dashboard's upcoming work", () => {
	test("shows each order's first unit, and how many more it has", async () => {
		await app.go("/");
		const shown = await upcomingWork();
		expect(shown.length).toBeGreaterThan(0);
		for (const [number, units] of shown) expect(units).toBe(await unitsOf(number));

		// Another of its customer's units on an order with one: "+1".
		const [other] = await rows<{ number: string; id: number }>(
			`select o.number, e.id from "order" o join equipment e on e.customer_id = o.customer_id
			 where o.organization_id = ? and o.number in (${shown.map(() => "?").join(", ")})
			  and (select count(*) from order_unit where order_id = o.id) = 1
			  and e.id not in (select equipment_id from order_unit where order_id = o.id)
			 order by o.number, e.id limit 1`,
			[north.id, ...shown.map(([number]) => number)],
		);
		expect(other).toBeDefined();
		await app.go(`/orders/${other.number}/edit`);
		await quiet(app.page);
		await addUnits(app, other);
		await app.page.getByRole("button", { name: "Save order" }).click();
		await app.page.waitForURL((url) => url.pathname === `/orders/${other.number}`);

		await app.go("/");
		const after = new Map(await upcomingWork());
		expect(after.get(other.number)).toBe(await unitsOf(other.number));
		expect(after.get(other.number)).toMatch(/ \+1$/);
	});
});
