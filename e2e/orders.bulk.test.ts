import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "../src/lib/format.ts";
import { isRemote, organizations, rows, unbalancedStock, useApp, value } from "./app.ts";
import { orderId, shownNumbers, snapshot } from "./orders-helpers.ts";
import { remoteErrorStatus, tamperWithCommand } from "./remote-functions.ts";

const { north } = organizations;
const app = useApp();

describe("bulk actions on selected orders, in North", () => {
	/** Ticks the row of an order on the shown page. */
	const select = (number: string) =>
		app.page
			.locator('[data-slot="data-table"] tbody tr', { hasText: number })
			.getByRole("checkbox", { name: "Select row" })
			.click();
	const bar = () => app.page.getByRole("region", { name: "Actions on the selected rows" });

	/** A customer of North's (the last such) with at least `count` orders in `statuses`. */
	const customerWith = async (statuses: string[], count: number) => {
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in (${statuses.map(() => "?").join(", ")})
			 group by c.id having count(*) >= ? order by c.id desc limit 1`,
			[north.id, ...statuses, count],
		);
		return code;
	};
	const ordersOf = (code: string, status: string) =>
		rows<{ id: number; number: string; engineer_id: number | null }>(
			`select o.id, o.number, o.engineer_id from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ? and o.status = ? order by o.number`,
			[north.id, code, status],
		);
	/** The activity logged for an order, newest first. */
	const activityOf = (id: number) =>
		rows<{ action: string; changes: string | null; user_name: string }>(
			`select action, changes, user_name from activity where organization_id = ?
			 and subject_type = 'order' and subject_id = ? order by id desc`,
			[north.id, String(id)],
		);

	test("assigning the selected orders an engineer updates them and logs it", async () => {
		const { page } = app;
		const code = await customerWith(["quote", "scheduled"], 2);
		const picked = [...(await ordersOf(code, "quote")), ...(await ordersOf(code, "scheduled"))]
			.toSorted((a, b) => a.number.localeCompare(b.number))
			.slice(0, 2);
		const [engineer] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 1
			 and id not in (${picked.map((o) => o.engineer_id ?? 0).join(", ")}) order by id desc limit 1`,
			[north.id],
		);

		await app.go(`/orders?customer=${code}&status=quote,scheduled&sort=number&size=50`);
		await expect.poll(() => bar().count()).toBe(0);
		for (const order of picked) await select(order.number);
		await bar().getByText("2 selected").waitFor();

		await bar().getByRole("button", { name: "Assign engineer" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText("Assign 2 orders").waitFor();
		// Only active engineers, and nobody (once they've loaded).
		const engineerField = dialog.getByLabel("Engineer");
		await engineerField.locator("option", { hasText: "Unassigned" }).waitFor({ state: "attached" });
		const options = await engineerField.locator("option").allInnerTexts();
		expect(options).toContain("Unassigned");
		const inactive = await rows<{ name: string }>(
			`select name from engineer where organization_id = ? and active = 0`,
			[north.id],
		);
		for (const { name } of inactive) expect(options).not.toContain(name);
		await dialog.getByLabel("Engineer").selectOption({ label: engineer.name });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast("2 updated");

		for (const order of picked) {
			expect(
				await value(`select engineer_id from "order" where id = ?`, [order.id]),
				order.number,
			).toBe(engineer.id);
			const [latest] = await activityOf(order.id);
			expect(latest.action).toBe("updated");
			expect(JSON.parse(latest.changes!)).toEqual({ engineerId: [order.engineer_id, engineer.id] });
			// The list shows it, and the selection is gone.
			await expect
				.poll(() => page.locator("tbody tr", { hasText: order.number }).innerText())
				.toContain(engineer.name);
		}
		expect(await bar().count()).toBe(0);
	});

	test("changing the status skips an invoiced order, and says why", async () => {
		const { page } = app;
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from customer c where c.organization_id = ?
			 and exists (select 1 from "order" o where o.customer_id = c.id and o.status = 'invoiced')
			 and exists (select 1 from "order" o where o.customer_id = c.id and o.status = 'quote')
			 order by c.id desc limit 1`,
			[north.id],
		);
		const [invoiced] = await ordersOf(code, "invoiced");
		const [quote] = await ordersOf(code, "quote");
		const before = await snapshot(invoiced.id);

		await app.go(`/orders?customer=${code}&status=quote,invoiced&sort=number&size=50`);
		await select(invoiced.number);
		await select(quote.number);
		await bar().getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText("Applies to 1 of the 2 selected; the others are skipped.").waitFor();
		await dialog.getByLabel("Status").selectOption({ label: "Cancelled" });
		await dialog.getByRole("button", { name: "Apply" }).click();

		await app.toast("1 updated, 1 skipped");
		await page
			.locator("[data-sonner-toast]", { hasText: `${invoiced.number} is invoiced` })
			.waitFor();
		expect(await value(`select status from "order" where id = ?`, [quote.id])).toBe("cancelled");
		expect(await snapshot(invoiced.id)).toEqual(before);
		expect((await activityOf(quote.id))[0].action).toBe("updated");
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("deleting the selected orders asks first, then deletes them and logs it", async () => {
		const { page } = app;
		const code = await customerWith(["quote"], 2);
		const picked = (await ordersOf(code, "quote")).slice(0, 2);

		await app.go(`/orders?customer=${code}&status=quote&sort=number&size=50`);
		for (const order of picked) await select(order.number);
		// Assign and status as buttons, the rest (with the modules' actions) in a menu.
		await bar().getByRole("button", { name: "More actions" }).click();
		await page.getByRole("menuitem", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText("Delete 2 orders?").waitFor();
		// Nothing's deleted until it's confirmed.
		expect(await orderId(picked[0].number, north.id)).toBe(picked[0].id);
		await dialog.getByRole("button", { name: "Delete" }).click();

		await app.toast("2 deleted");
		for (const order of picked) {
			expect(await orderId(order.number, north.id), order.number).toBeUndefined();
			expect((await activityOf(order.id))[0].action).toBe("deleted");
			await expect.poll(() => page.locator("tbody tr", { hasText: order.number }).count()).toBe(0);
		}
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("selecting all the matching orders acts on exactly the filtered ones", async () => {
		const { page } = app;
		// More than fit on a page.
		const cancelled = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'cancelled'`,
			[north.id],
		);
		expect(cancelled.length).toBeGreaterThan(20);
		const matching = new Set(cancelled.map((o) => o.id));
		const [engineer] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 1 order by id desc limit 1`,
			[north.id],
		);
		/** Every order of every organization with its engineer. */
		const engineers = () =>
			rows<{ id: number; engineer_id: number | null }>(
				`select id, engineer_id from "order" order by id`,
			);
		const before = await engineers();

		await app.go("/orders?status=cancelled&sort=number");
		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		const total = formatNumber(cancelled.length);
		await bar()
			.getByRole("button", { name: `Select all ${total} matching` })
			.click();
		await bar().getByText(`All ${total} matching selected`).waitFor();
		await bar().getByRole("button", { name: "Assign engineer" }).click();
		const dialog = page.getByRole("alertdialog");
		const field = dialog.getByLabel("Engineer");
		await field.locator("option", { hasText: engineer.name }).waitFor({ state: "attached" });
		await field.selectOption({ label: engineer.name });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast(`${total} updated`);

		// The cancelled orders of North, all of them, and nothing else (not even South's).
		expect(await engineers()).toEqual(
			before.map((o) => (matching.has(o.id) ? { ...o, engineer_id: engineer.id } : o)),
		);
	});

	test("a bulk action with a malformed target is refused with a 400", async () => {
		const { page } = app;
		const [quote] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' order by number limit 1`,
			[north.id],
		);
		const before = await snapshot(quote.id);
		await app.go("/orders?status=quote&sort=number");
		await select((await shownNumbers(app))[0]);
		await bar().getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByLabel("Status").selectOption({ label: "Cancelled" });
		// The command goes out with a filter that doesn't exist, instead of the selected order.
		await tamperWithCommand<{ status: string }>(page, "bulkSetOrderStatus", (arg) => ({
			...arg,
			target: { matching: { q: "", filters: { status: ["bogus"] } } },
		}));
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "bulkSetOrderStatus")),
				dialog.getByRole("button", { name: "Apply" }).click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(400);
		expect(await snapshot(quote.id)).toEqual(before);
	});
});
