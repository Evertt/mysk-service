import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";
import { snapshot } from "./orders-helpers.ts";
import { tamperWithCommand } from "./remote-functions.ts";

const { north, south } = organizations;
const app = useApp();

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

	test("deleting an order from its row asks first", async () => {
		const { page } = app;
		const [order] = await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? and status = 'quote'
			 order by number desc limit 1`,
			[north.id],
		);
		await app.go("/orders?status=quote&sort=-number");
		const menu = await openMenu(order.number);
		await menu.getByRole("menuitem", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText(`Delete: ${order.number}`).waitFor();
		expect(await value(`select id from "order" where id = ?`, [order.id])).toBe(order.id);
		await dialog.getByRole("button", { name: "Delete" }).click();

		await app.toast(`${order.number} deleted`);
		expect(await value(`select id from "order" where id = ?`, [order.id])).toBeUndefined();
		expect(
			await value(
				`select action from activity where organization_id = ? and subject_type = 'order'
				 and subject_id = ? order by id desc limit 1`,
				[north.id, String(order.id)],
			),
		).toBe("deleted");
	});

	test("a row's action with the id of South's order leaves it alone", async () => {
		const { page } = app;
		const [victim] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' order by id limit 1`,
			[south.id],
		);
		const victimBefore = await snapshot(victim.id);
		const [own] = await rows<{ id: number; number: string; engineer_id: number | null }>(
			`select id, number, engineer_id from "order" where organization_id = ? and status = 'quote'
			 order by number limit 1`,
			[north.id],
		);
		const ownBefore = await snapshot(own.id);
		const engineer = await anotherEngineer(own.engineer_id);

		await app.go("/orders?status=quote&sort=number");
		const menu = await openMenu(own.number);
		await menu.getByRole("menuitem", { name: "Assign engineer" }).click();
		const dialog = page.getByRole("alertdialog");
		const field = dialog.getByLabel("Engineer");
		await field.locator("option", { hasText: engineer.name }).waitFor({ state: "attached" });
		await field.selectOption({ label: engineer.name });
		// The command goes out with South's order instead of the row's.
		await tamperWithCommand<{ engineerId: number | null }>(page, "bulkAssignOrders", (arg) => ({
			...arg,
			target: { ids: [victim.id] },
		}));
		await app.expectingErrors(async () => {
			await dialog.getByRole("button", { name: "Apply" }).click();
			await app.toast(`${own.number} not found`);
		});

		expect(await snapshot(victim.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});
});
