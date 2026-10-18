/**
 * Bulk actions on the orders list: selecting orders, the dialog, the toast and the refreshed rows,
 * and a single order's row menu. What the bulk commands skip, delete, log and act on is
 * `orders/server/bulk.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";
import { snapshot } from "./orders-helpers.ts";

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
});

/** Opens the row menu of an order on the shown page. */
const openMenu = async (number: string) => {
	await app.page.getByRole("button", { name: `Actions for ${number}` }).click();
	return app.page.getByRole("menu");
};

/** An active engineer of North's other than `not`. */
const anotherEngineer = async (not: number | null) => {
	const [engineer] = await rows<{ id: number; name: string }>(
		`select id, name from engineer where organization_id = ? and active = 1 and id != ?
		 order by id desc limit 1`,
		[north.id, not ?? 0],
	);
	return engineer;
};

// Deleting from a row's menu asks first, naming the row (`bulk-action-bar.svelte.spec.ts`), and
// deletes as the bulk action above does.
describe("the bulk actions on a single order, from its row's menu, in North", () => {
	test("assigning an engineer to one order updates it alone and logs it", async () => {
		const { page } = app;
		const [order, neighbour] = await rows<{
			id: number;
			number: string;
			engineer_id: number | null;
		}>(
			`select id, number, engineer_id from "order" where organization_id = ? and status = 'quote'
			 order by number limit 2`,
			[north.id],
		);
		const engineer = await anotherEngineer(order.engineer_id);
		const neighbourBefore = await snapshot(neighbour.id);

		await app.go("/orders?status=quote&sort=number");
		const menu = await openMenu(order.number);
		// The status is changed right in its cell, not from the menu.
		await menu.getByRole("menuitem", { name: "Assign engineer" }).waitFor();
		expect(await menu.getByRole("menuitem", { name: "Change status" }).count()).toBe(0);
		await menu.getByRole("menuitem", { name: "Assign engineer" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText(`Assign engineer: ${order.number}`).waitFor();
		const field = dialog.getByLabel("Engineer");
		await field.locator("option", { hasText: engineer.name }).waitFor({ state: "attached" });
		await field.selectOption({ label: engineer.name });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast(`${order.number} updated`);

		expect(await value(`select engineer_id from "order" where id = ?`, [order.id])).toBe(
			engineer.id,
		);
		const [logged] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where organization_id = ? and subject_type = 'order'
			 and subject_id = ? order by id desc limit 1`,
			[north.id, String(order.id)],
		);
		expect(logged.action).toBe("updated");
		expect(JSON.parse(logged.changes)).toEqual({ engineerId: [order.engineer_id, engineer.id] });
		expect(await snapshot(neighbour.id)).toEqual(neighbourBefore);
		await expect
			.poll(() => page.locator("tbody tr", { hasText: order.number }).innerText())
			.toContain(engineer.name);
		// No selection was made or left.
		expect(await page.getByRole("region", { name: "Actions on the selected rows" }).count()).toBe(
			0,
		);
	});

	test("an invoiced order's menu offers none of the actions that don't apply to it", async () => {
		const number = await value<string>(
			`select number from "order" where organization_id = ? and status = 'invoiced'
			 order by number limit 1`,
			[north.id],
		);
		await app.go(`/orders?status=invoiced&sort=number`);
		const menu = await openMenu(number);
		await menu.getByRole("menuitem", { name: "Open" }).waitFor();
		for (const name of ["Assign engineer", "Change status", "Delete"]) {
			expect(await menu.getByRole("menuitem", { name }).count(), name).toBe(0);
		}
		await app.page.keyboard.press("Escape");
	});
});
