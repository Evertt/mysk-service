import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import EquipmentByStatusChart from "#routes/(app)/(dashboard)/equipment-by-status-chart.svelte";

const data = [
	{ status: "operational" as const, count: 128 },
	{ status: "needs_service" as const, count: 25 },
	{ status: "out_of_service" as const, count: 9 },
	{ status: "decommissioned" as const, count: 0 },
];

/** The rows of the visually hidden table, as text. */
const tableRows = (container: HTMLElement) =>
	[...container.querySelectorAll('[data-slot="chart-table"] tbody tr')].map((row) =>
		[...row.children].map((cell) => cell.textContent?.trim()),
	);

test("renders its numbers as a visually hidden table, with the chart hidden from assistive technology", async () => {
	const { container } = await render(EquipmentByStatusChart, { data });

	const table = container.querySelector('[data-slot="chart-table"]')!;
	expect(table).toHaveClass("sr-only");
	expect(table.querySelector("caption")?.textContent).toBe("Equipment by status");
	expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
		"Status",
		"Units",
	]);
	expect(tableRows(container)).toEqual([
		["Operational", "128"],
		["Needs service", "25"],
		["Out of service", "9"],
		["Decommissioned", "0"],
	]);
	expect(container.querySelector('[data-slot="chart"]')).toHaveAttribute("aria-hidden", "true");
});

test("draws a bar per status, in the status colours", async () => {
	const { container } = await render(EquipmentByStatusChart, { data });

	// The chart draws once it has measured its box.
	await expect.poll(() => container.querySelectorAll(".lc-bars-bar").length).toBe(4);
	const fills = [...container.querySelectorAll<SVGElement>(".lc-bars-bar")].map(
		(bar) => bar.style.fill || bar.getAttribute("fill"),
	);
	expect(fills).toEqual([
		"var(--primary)",
		"var(--chart-3)",
		"var(--destructive)",
		"var(--muted-foreground)",
	]);
});
