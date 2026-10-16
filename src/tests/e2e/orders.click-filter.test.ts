import { describe, expect, test } from "vite-plus/test";

import { afresh, countIn, organizations, rows, useApp, value } from "./app.ts";
import { shownNumbers } from "./orders-helpers.ts";

const { north } = organizations;
const app = useApp();

/** The first row of the orders table. */
const firstRow = () => app.page.locator('[data-slot="data-table"] tbody tr').first();

/** The value buttons of a column in the rows, by name, e.g. "Filter by Repair". */
const valuesIn = (columnId: string, name: string) =>
	app.page
		.locator(`[data-slot="data-table"] tbody [data-column-id="${columnId}"]`)
		.getByRole("button", { name, exact: true });

/** How many of North's orders have `value` in `column`. */
const ordersWith = async (column: string, value: string) =>
	(
		await rows<{ count: number }>(
			`select count(*) as count from "order" where organization_id = ? and ${column} = ?`,
			[north.id, value],
		)
	)[0].count;

/** The first row's order's `column`, as stored. */
const firstOrders = async (column: string) => {
	const [number] = await shownNumbers(app);
	return value<string>(`select ${column} from "order" where organization_id = ? and number = ?`, [
		north.id,
		number,
	]);
};

const labels: Record<string, Record<string, string>> = {
	type: {
		breakdown: "Breakdown",
		repair: "Repair",
		maintenance: "Maintenance",
		inspection: "Inspection",
		installation: "Installation",
		survey: "Survey",
		damage: "Damage",
		project: "Project",
		other: "Other",
	},
	priority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
	status: {
		quote: "Quote",
		scheduled: "Scheduled",
		in_progress: "In progress",
		completed: "Completed",
		invoiced: "Invoiced",
		cancelled: "Cancelled",
	},
};

describe("clicking a value in the orders list filters by it, in North", () => {
	for (const column of ["type", "priority"]) {
		test(`clicking an order's ${column} filters by it, and clicking it again stops`, async () => {
			const { page } = app;
			await app.go(afresh("/orders"));
			const all = await countIn("order", north.id);
			const stored = (await firstOrders(column))!;
			const label = labels[column][stored];

			await firstRow()
				.getByRole("button", { name: `Filter by ${label}`, exact: true })
				.click();
			await page.waitForURL((url) => url.searchParams.get(column) === stored);
			await app.tableSettled();
			expect(await app.rowCount()).toBe(await ordersWith(column, stored));
			// Every row shown has it, and offers to stop filtering by it.
			const shown = await page.locator("tbody tr").count();
			expect(await valuesIn(column, `Stop filtering by ${label}`).count()).toBe(shown);

			await valuesIn(column, `Stop filtering by ${label}`).first().click();
			await page.waitForURL((url) => !url.searchParams.has(column));
			await app.tableSettled();
			expect(await app.rowCount()).toBe(all);
		});
	}

	test("clicking the status badge filters by the status, while its arrow opens the statuses", async () => {
		const { page } = app;
		await app.go("/orders?status=quote,scheduled&page=1");
		const [number] = await shownNumbers(app);
		const stored = (await firstOrders("status"))!;
		const label = labels.status[stored];
		const cell = firstRow().locator('[data-column-id="status"]');

		// The arrow opens the list of statuses, and changes nothing until one is chosen.
		await cell.getByRole("button", { name: `Change status of ${number}: ${label}` }).click();
		await page.getByRole("option", { name: "Completed" }).waitFor();
		await page.keyboard.press("Escape");
		await page.getByRole("option").first().waitFor({ state: "detached" });
		expect(new URL(page.url()).searchParams.get("status")).toBe("quote,scheduled");

		// The badge itself takes the filter out of the two it has, and back in.
		await cell.getByRole("button", { name: `Stop filtering by ${label}`, exact: true }).click();
		const other = stored === "quote" ? "scheduled" : "quote";
		await page.waitForURL((url) => url.searchParams.get("status") === other);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await ordersWith("status", other));
		await valuesIn("status", `Stop filtering by ${labels.status[other]}`).first().click();
		await page.waitForURL((url) => !url.searchParams.has("status"));
		await app.tableSettled();

		const first = (await firstOrders("status"))!;
		await firstRow()
			.locator('[data-column-id="status"]')
			.getByRole("button", { name: `Filter by ${labels.status[first]}`, exact: true })
			.click();
		await page.waitForURL((url) => url.searchParams.get("status") === first);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await ordersWith("status", first));
	});

	test("the customer stays a link to the customer's page", async () => {
		const { page } = app;
		await app.go(afresh("/orders"));
		const [number] = await shownNumbers(app);
		const code = await value<string>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.number = ?`,
			[north.id, number],
		);
		const customer = firstRow().locator('[data-column-id="customer"]');
		expect(await customer.getByRole("button").count()).toBe(0);
		await customer.getByRole("link").first().click();
		await page.waitForURL((url) => url.pathname === `/customers/${code}`);
	});
});
