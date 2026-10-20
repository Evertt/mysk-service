import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp } from "#e2e/app.ts";

const { north } = organizations;
const app = useApp();

/** What the invoices module adds to the orders list's bulk actions, in North. */
describe("bulk actions on selected orders, in North", () => {
	/** Ticks the row of an order on the shown page. */
	const select = (number: string) =>
		app.page
			.locator('[data-slot="data-table"] tbody tr', { hasText: number })
			.getByRole("checkbox", { name: "Select row" })
			.click();
	const bar = () => app.page.getByRole("region", { name: "Actions on the selected rows" });

	test("creating an invoice from two completed orders of one customer opens the draft", async () => {
		const { page } = app;
		const billable = `o.status = 'completed' and not exists (select 1 from invoice_line l
			join invoice i on i.id = l.invoice_id where l.order_id = o.id and i.status != 'void')`;
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and ${billable}
			 group by c.id having count(*) >= 2 order by c.id desc limit 1`,
			[north.id],
		);
		const picked = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ? and ${billable} order by o.number limit 2`,
			[north.id, code],
		);

		await app.go(`/orders?customer=${code}&status=completed&sort=number&size=50`);
		for (const order of picked) await select(order.number);
		await bar().getByRole("button", { name: "More actions" }).click();
		await page.getByRole("menuitem", { name: "Create invoice" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText("Create an invoice for 2 orders?").waitFor();
		await dialog.getByRole("button", { name: "Create invoice" }).click();

		await page.waitForURL((url) => /^\/invoices\/[^/]+$/.test(url.pathname));
		await app.toast("2 on a new draft");
		expect(app.path()).toMatch(/^\/invoices\/INV-/);
		// The draft opens; what's on it is the server's (`invoices.spec.ts`).
		await app.page.locator('h1 ~ [data-slot="badge"]', { hasText: "Draft" }).waitFor();
	});

	test("a completed order's row menu creates an invoice for it alone; others' don't offer it", async () => {
		const { page } = app;
		const billable = `o.status = 'completed' and not exists (select 1 from invoice_line l
			join invoice i on i.id = l.invoice_id where l.order_id = o.id and i.status != 'void')`;
		const [order] = await rows<{ id: number; number: string; customerId: number }>(
			`select o.id, o.number, o.customer_id as customerId from "order" o
			 where o.organization_id = ? and ${billable} order by o.number desc limit 1`,
			[north.id],
		);
		const [quote] = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status = 'quote'
			 order by number limit 1`,
			[north.id],
		);
		const menuOf = async (number: string) => {
			await page.getByRole("button", { name: `Actions for ${number}` }).click();
			return page.getByRole("menu");
		};

		// Not for an order that isn't completed.
		await app.go(`/orders?status=quote&sort=number`);
		let menu = await menuOf(quote.number);
		await menu.getByRole("menuitem", { name: "Assign engineer" }).waitFor();
		expect(await menu.getByRole("menuitem", { name: "Create invoice" }).count()).toBe(0);
		await page.keyboard.press("Escape");

		await app.go(`/orders?q=${encodeURIComponent(order.number)}`);
		menu = await menuOf(order.number);
		await menu.getByRole("menuitem", { name: "Create invoice" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText(`Create invoice: ${order.number}`).waitFor();
		await dialog.getByRole("button", { name: "Create invoice" }).click();

		await page.waitForURL((url) => /^\/invoices\/[^/]+$/.test(url.pathname));
		await app.toast(`${order.number} on a new draft`);
	});
});
