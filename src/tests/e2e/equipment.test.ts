import { describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value } from "./app.ts";
import { busiest, equipmentPage, unit, unitId } from "./equipment-helpers.ts";

const { north } = organizations;
const app = useApp();
const { bodyRows, card, shownTimeline } = equipmentPage(app);

const serial = "ZZ-TEST-0001";

describe("in North", () => {
	test("registering a unit validates it first", async () => {
		const { page } = app;
		const before = await countIn("equipment", north.id);
		await app.go("/equipment/new");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		expect((await app.issues()).length).toBeGreaterThanOrEqual(5);

		// A serial number North already has, in lower case, and a warranty ending before installation.
		const { serial: busy } = await busiest(north.id);
		await page.getByLabel("Serial number").fill(busy.toLowerCase());
		await page.getByLabel("Manufacturer").fill("Testco");
		await page.getByLabel("Model").fill("TX-1");
		await page.getByLabel("Category").selectOption("chiller");
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Installed on").fill("2026-01-10");
		await page.getByLabel("Warranty until").fill("2025-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringContaining("already has this serial"));
		expect(issues).toContainEqual(expect.stringContaining("can't end before"));

		await page.getByLabel("Serial number").fill("zz test!");
		await page.getByLabel("Warranty until").fill("2029-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		expect(await app.issues()).toContainEqual(
			expect.stringContaining("letters, digits and dashes"),
		);
		expect(app.path()).toBe("/equipment/new");
		expect(await countIn("equipment", north.id)).toBe(before);
	});

	test("a new unit is stored with its serial number in upper case", async () => {
		const { page } = app;
		await page.getByLabel("Serial number").fill(serial.toLowerCase());
		await page.getByRole("button", { name: "Register equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
		await page.getByRole("heading", { name: "Testco TX-1" }).waitFor();
		await app.toast("Equipment registered");
		expect(
			await rows(`select organization_id from equipment where serial_number = ?`, [serial]),
		).toEqual([{ organization_id: north.id }]);
		expect(await page.getByText("No orders yet").count()).toBe(1);
		expect(await shownTimeline()).toEqual(["warranty", "installation"]);
		expect(await card("Last service")).toContain("Never");
	});

	test("editing it saves the changes, including another customer", async () => {
		const { page } = app;
		const id = await unitId(serial, north.id);
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Model").inputValue()).toBe("TX-1");
		expect(await page.getByLabel("Installed on").inputValue()).toBe("2026-01-10");
		const customer = await page.getByLabel("Customer").inputValue();

		await page.getByLabel("Model").fill("TX-2");
		await page.getByLabel("Status").selectOption("needs_service");
		await page.getByLabel("Customer").selectOption({ index: 2 });
		const moved = await page.getByLabel("Customer").inputValue();
		expect(moved).not.toBe(customer);
		await page.getByRole("button", { name: "Save equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
		await page.getByRole("heading", { name: "Testco TX-2" }).waitFor();
		const [saved] = await rows(`select model, status, customer_id from equipment where id = ?`, [
			id,
		]);
		expect(saved).toEqual({ model: "TX-2", status: "needs_service", customer_id: Number(moved) });
	});

	test("selected units get another status, and those with orders aren't deleted", async () => {
		const { page } = app;
		const id = await unitId(serial, north.id);
		const [{ code, customer_id }] = await rows<{ code: string; customer_id: number }>(
			`select c.code, e.customer_id from equipment e join customer c on c.id = e.customer_id
			 where e.id = ?`,
			[id],
		);
		const [used] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.customer_id = ?
			 and exists (select 1 from "order" o where o.equipment_id = e.id) order by e.id limit 1`,
			[customer_id],
		);
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		const select = (serialNumber: string) =>
			bodyRows().filter({ hasText: serialNumber }).getByRole("checkbox").click();

		await app.go(`/equipment?customer=${code}&size=100`);
		await select(serial);
		await bar.getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByLabel("Status").selectOption({ label: "Out of service" });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast("1 updated");
		expect(await value(`select status from equipment where id = ?`, [id])).toBe("out_of_service");
		expect(
			await value(
				`select action from activity where organization_id = ? and subject_type = 'equipment'
				 and subject_id = ? order by id desc limit 1`,
				[north.id, String(id)],
			),
		).toBe("updated");
		await expect.poll(() => bar.count()).toBe(0);

		const before = await unit(used.id);
		await select(used.serial_number);
		await bar.getByRole("button", { name: "Delete" }).click();
		await dialog.getByText("Delete the selected units?").waitFor();
		await dialog.getByRole("button", { name: "Delete" }).click();
		await app.toast("1 skipped", `${used.serial_number}: This unit can't be deleted`);
		expect(await unit(used.id)).toEqual(before);
		await app.go(`/equipment/${serial}`);
	});

	test("deleting it removes it, after which it's a 404", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/equipment");
		expect(await unitId(serial, north.id)).toBeUndefined();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
	});
});
