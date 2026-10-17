import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, value, useApp } from "#e2e/app.ts";

import { dockOf, escalatedOrders, postEvents, salvoEvent, shltrOwner } from "./helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: shltrOwner });

const card = (code: string) => app.page.locator(`[data-dock="${code}"]`);

describe("the live board", () => {
	test("shows Weggemans' docks as seeded: Laden, Bezet, Vrij and Storing", async () => {
		const { page } = app;
		await app.go("/equipment");
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Docks" }).click();
		await page.waitForURL((url) => url.pathname === "/docks");
		await card("DOCK 05").waitFor();

		expect(await card("DOCK 05").locator("[data-dock-state]").getAttribute("data-dock-state")).toBe(
			"loading",
		);
		await expect.poll(() => card("DOCK 05").locator("[data-door-timer]").count()).toBe(1);
		expect(await card("DOCK 05").locator("[data-beacon]").getAttribute("data-beacon")).toBe(
			"green",
		);
		expect(await card("DOCK 05").textContent()).toContain("84-BNX-7");

		expect(await card("DOCK 06").locator("[data-dock-state]").textContent()).toContain("Occupied");
		expect(await card("DOCK 06").locator('[data-dock-warning="unlocked"]').count()).toBe(1);
		expect(await card("DOCK 06").textContent()).toContain("With the driver");
		expect(await card("DOCK 07").locator("[data-dock-state]").textContent()).toContain("Free");
		expect(await card("DOCK 08").locator("[data-dock-state]").textContent()).toContain("Fault");
		expect(await card("DOCK 08").locator('[data-dock-warning="fault"]').count()).toBe(1);
		// Docks 01–04 have no Salvo: listed, without a card.
		const withoutSalvo = page.locator("[data-docks-without-salvo] [data-dock]");
		expect(await withoutSalvo.allTextContents()).toEqual([
			expect.stringContaining("DOCK 01"),
			expect.stringContaining("DOCK 02"),
			expect.stringContaining("DOCK 03"),
			expect.stringContaining("DOCK 04"),
		]);

		const figures = page.locator("[data-dock-figures]");
		expect(await figures.textContent()).toContain("3/4");
		// Each Salvo dock lists its recent sessions.
		expect(await card("DOCK 07").locator("[data-dock-sessions] li").count()).toBeGreaterThan(0);
		await page.getByText("How Salvo secures the dock").waitFor();
	});

	test("the door timer counts up", async () => {
		const timer = card("DOCK 05").locator("[data-door-timer]");
		const before = Number(await timer.getAttribute("data-door-timer"));
		await expect
			.poll(async () => Number(await timer.getAttribute("data-door-timer")))
			.toBeGreaterThan(before);
	});

	test("a batch from the feed changes the board live", async () => {
		const { page } = app;
		const result = await postEvents([
			salvoEvent("key_moved", "DOCK 06", 0, { to: "scp" }),
			salvoEvent("lock", "DOCK 06"),
		]);
		expect(result).toMatchObject({ status: 200, body: { applied: 2 } });
		// No reload: the live query tells the board.
		await card("DOCK 06").locator('[data-dock-state="loading"]').waitFor();
		expect(await card("DOCK 06").locator('[data-dock-warning="unlocked"]').count()).toBe(0);
		await expect.poll(() => page.locator("[data-dock-figures]").textContent()).toContain("3/4");
		expect((await dockOf(shltr.id, "DOCK 06")).locked).toBe(1);
	});

	test("a door open an hour makes one breakdown order on the dock's door", async () => {
		const { page } = app;
		const dock = await dockOf(shltr.id, "DOCK 07");
		expect(dock.door_id).not.toBeNull();
		const result = await postEvents([
			salvoEvent("check_in", "DOCK 07", 75, { carrier: "Bakker Transport", plate: "12-ABC-3" }),
			salvoEvent("key_moved", "DOCK 07", 70, { to: "scp" }),
			salvoEvent("lock", "DOCK 07", 70),
			salvoEvent("door_open", "DOCK 07", 61),
		]);
		expect(result.status).toBe(200);
		// The order on the door, and only one (`ingest.spec.ts`'s door rules).
		expect(await escalatedOrders(dock.door_id!)).toHaveLength(1);

		await card("DOCK 07").locator('[data-door-band="red"]').waitFor();
		expect(await card("DOCK 07").locator('[data-dock-warning="red"]').count()).toBe(1);
		await page.locator("[data-dock-notices]").getByText("DOCK 07").first().waitFor();
		expect(
			await value<number>(
				`select count(*) from activity where organization_id = ? and action = 'door_escalated'`,
				[shltr.id],
			),
		).toBe(1);
	});

	test("fits a phone's screen", async () => {
		const { page } = app;
		await onPhone(page, async () => {
			await app.go("/docks");
			await card("DOCK 05").waitFor();
			expect(await fitsWidth(page)).toBe(true);
		});
	});
});

describe("the cards on core pages", () => {
	test("the customer's page lists its docks, and a manager adds and deletes one", async () => {
		const { page } = app;
		const [weggemans] = await rows<{ code: string; site: number }>(
			`select c.code, s.id as site from customer c join customer_site s on s.customer_id = c.id
			 where c.organization_id = ? and c.name = 'Weggemans Logistiek'`,
			[shltr.id],
		);
		await app.go(`/customers/${weggemans.code}`);
		const docks = page.locator("[data-docks-card]");
		await docks.locator('[data-customer-dock="DOCK 05"]').waitFor();
		expect(await docks.locator("[data-customer-dock]").count()).toBe(8);

		await docks.getByRole("button", { name: "Add dock" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Code").fill("DOCK 09");
		await dialog.getByLabel("Position").fill("P-09 · Expeditie oost");
		await dialog.getByLabel("SCP panel").fill("SCP-09");
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		await docks.locator('[data-customer-dock="DOCK 09"]').waitFor();
		expect(
			await value<string>(
				`select position from dock_position where organization_id = ? and code = 'DOCK 09'`,
				[shltr.id],
			),
		).toBe("P-09 · Expeditie oost");

		// A code another dock has is refused.
		await docks.getByRole("button", { name: "Add dock" }).click();
		await dialog.getByLabel("Code").fill("DOCK 05");
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		expect(await app.issues()).toContain("Another dock already has this code");
		await page.keyboard.press("Escape");

		await docks.getByRole("button", { name: "Delete DOCK 09?" }).click();
		await app.submit(page.getByRole("alertdialog").getByRole("button", { name: "Delete dock" }));
		await docks.locator('[data-customer-dock="DOCK 09"]').waitFor({ state: "detached" });
		expect(
			await value<number>(
				`select count(*) from dock_position where organization_id = ? and code = 'DOCK 09'`,
				[shltr.id],
			),
		).toBe(0);
	});

	test("a dock's door shows its use", async () => {
		const { page } = app;
		const dock = await dockOf(shltr.id, "DOCK 05");
		const serial = await value<string>(`select serial_number from equipment where id = ?`, [
			dock.door_id,
		]);
		await app.go(`/equipment/${serial}`);
		const usage = page.locator("[data-dock-usage]");
		await usage.waitFor();
		expect(await usage.textContent()).toContain("DOCK 05");
		const today = await value<number>(
			`select count(*) from dock_session where dock_id = ? and checked_in_at >= ?`,
			[dock.id, Math.floor(Temporal.Now.zonedDateTimeISO().startOfDay().epochMilliseconds / 1000)],
		);
		expect(Number(await usage.locator("[data-sessions-today]").textContent())).toBe(today);
	});
});
