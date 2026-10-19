/**
 * The dashboard: the greeting, the charts as drawn (and their hidden tables), the cards packed
 * into columns or stacked on a phone, redrawing when the window grows, and the upcoming work's
 * units. The numbers (the tiles' trends, the charts' counts and revenue, South's own, the upcoming
 * work's units) are `routes/(app)/(dashboard)/dashboard.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, quiet, rows, userNames, useApp } from "./app.ts";
import { cardBoxes, columnsOf, expectApart } from "./masonry-helpers.ts";

const { north } = organizations;
const app = useApp();

/** The card of a chart. */
const chartCard = (title: string) => app.page.locator('[data-slot="card"]', { hasText: title });

/** A chart's visually hidden table, as rows of cell texts (the row header first). */
async function chartTable(title: string) {
	const trs = await chartCard(title).locator('[data-slot="chart-table"] tbody tr').all();
	return Promise.all(trs.map((tr) => tr.locator("th, td").allInnerTexts()));
}

/** How many rows a chart's hidden table has. */
const chartRows = async (title: string) => (await chartTable(title)).length;

describe("the dashboard's greeting and tiles", () => {
	test("greets the member by first name, for the time of day", async () => {
		await app.go("/");
		const heading = app.page.getByRole("heading", { level: 1 });
		const firstName = userNames.admin.split(" ")[0];
		expect(await heading.innerText()).toMatch(
			new RegExp(`^Good (morning|afternoon|evening), ${firstName}$`),
		);
		await app.page.getByText("Here's what's happening today.").waitFor();
	});
});

describe("the dashboard's charts", () => {
	test("show the orders per week, revenue per month and equipment by status", async () => {
		await app.go("/");
		expect(
			await chartCard("Orders per week")
				.locator('[data-slot="chart-table"] thead th')
				.allInnerTexts(),
		).toEqual([
			"Week",
			"Awaiting acceptance",
			"Quote",
			"Scheduled",
			"In progress",
			"Completed",
			"Invoiced",
			"Cancelled",
		]);
		expect(await chartRows("Orders per week")).toBe(12);
		expect(await chartRows("Revenue per month")).toBe(12);
		expect((await chartTable("Equipment by status")).map((row) => row[0])).toEqual([
			"Operational",
			"Needs service",
			"Out of service",
			"Decommissioned",
		]);
	});

	// That a chart is hidden from assistive technology, with a bar per status, is
	// `equipment-by-status-chart.svelte.spec.ts`'s.

	test("fit a phone's screen, their hidden tables too", async () => {
		await onPhone(app.page, async () => {
			await app.go("/");
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});
});

/** The dashboard's cards' container (a masonry). */
const cards = () => app.page.locator("[data-dashboard-cards]");

/** The dashboard, once its cards are packed into columns. */
async function packedDashboard() {
	await app.go("/");
	await expect.poll(() => app.page.locator("[data-dashboard-cards][data-masonry]").count()).toBe(1);
	return cardBoxes(cards());
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
			const boxes = await cardBoxes(cards());
			expect(columnsOf(boxes).size).toBe(1);
			expectApart(boxes);
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	// Growing past the phone's width brings the sidebar in, and the charts redraw for their new
	// width at the same time. With another update pending then (the sidebar's menus awaiting the
	// user, a link's preload), Svelte computed the charts' state anew on every read, and the tab
	// froze for seven seconds (patched, see docs/upstream-bugs/README.md, 10).
	test("redraw at once when the window grows wide enough for the sidebar", async () => {
		const before = app.page.viewportSize();
		try {
			await app.page.setViewportSize({ width: 760, height: 900 });
			// Back to the dashboard from another page, in the app: the query only the sidebar's menus
			// read isn't loaded then (not in the server's render, nor shown in the narrow one), and the
			// pointer rests on a link it preloads.
			await packedDashboard();
			await app.page.getByRole("link", { name: "All orders" }).click();
			await app.page.waitForURL((url) => url.pathname === "/orders");
			await app.page.goBack();
			await expect
				.poll(() => app.page.locator("[data-dashboard-cards][data-masonry]").count())
				.toBe(1);
			await quiet(app.page);
			const sidebar = app.page.locator('[data-slot="sidebar-container"]');
			await expect.poll(() => sidebar.count()).toBe(0);
			await app.page.evaluate(() => {
				const tasks: number[] = [];
				Object.assign(window, { longTasks: tasks });
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) tasks.push(entry.duration);
				}).observe({ type: "longtask" });
			});
			await app.page.setViewportSize({ width: 900, height: 900 });
			// Past the charts' and the masonry's settling (150 ms), until the page answers again.
			const longest = await app.page.evaluate(async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
				await new Promise(requestAnimationFrame);
				return Math.max(0, ...(window as unknown as { longTasks: number[] }).longTasks);
			});
			await expect.poll(() => sidebar.isVisible()).toBe(true);
			// About 100 ms on a laptop, seven seconds with the bug; room for a busy test machine.
			expect(longest).toBeLessThan(1000);
		} finally {
			if (before) await app.page.setViewportSize(before);
		}
	});

	// That South, with fewer modules, lacks their cards is the modules' tests' (an empty slot on
	// the dashboard); the packing is the same as North's above.
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
		// That an order with more units has "+N" is `dashboard.spec.ts`'s (its unit count).
		for (const [number, units] of shown) expect(units).toBe(await unitsOf(number));
	});
});
