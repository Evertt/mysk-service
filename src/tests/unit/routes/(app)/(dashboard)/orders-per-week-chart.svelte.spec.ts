import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import OrdersPerWeekChart from "#routes/(app)/(dashboard)/orders-per-week-chart.svelte";

const data = [
	{
		week: new Date(2026, 8, 28),
		quote: 1,
		scheduled: 2,
		in_progress: 0,
		completed: 3,
		invoiced: 4,
		cancelled: 0,
	},
	{
		week: new Date(2026, 9, 5),
		quote: 11,
		scheduled: 17,
		in_progress: 1,
		completed: 0,
		invoiced: 0,
		cancelled: 2,
	},
];

test("renders a legend of the statuses and the weeks' numbers as a visually hidden table", async () => {
	const { container } = await render(OrdersPerWeekChart, { data });

	expect([...container.querySelectorAll("ul li")].map((item) => item.textContent?.trim())).toEqual([
		"Quote",
		"Scheduled",
		"In progress",
		"Completed",
		"Invoiced",
		"Cancelled",
	]);
	const table = container.querySelector('[data-slot="chart-table"]')!;
	expect(table).toHaveClass("sr-only");
	expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
		"Week",
		"Quote",
		"Scheduled",
		"In progress",
		"Completed",
		"Invoiced",
		"Cancelled",
	]);
	expect(
		[...table.querySelectorAll("tbody tr")].map((row) =>
			[...row.children].map((cell) => cell.textContent?.trim()),
		),
	).toEqual([
		["28 Sept – 4 Oct 2026", "1", "2", "0", "3", "4", "0"],
		["5 – 11 Oct 2026", "11", "17", "1", "0", "0", "2"],
	]);
});

test("stacks a segment per status with orders, per week", async () => {
	const { container } = await render(OrdersPerWeekChart, { data });

	// Every status is a series; the chart draws once it has measured its box.
	await expect.poll(() => container.querySelectorAll(".lc-bars-bar").length).toBe(12);
});
