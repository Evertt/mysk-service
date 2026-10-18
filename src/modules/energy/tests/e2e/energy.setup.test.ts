/**
 * Setting a site's energy monitoring up in the office, in SHLTR, as its owner: Weggemans' site in
 * Barneveld (where its Salvo docks are) from the customer's page, with a zone, a consumer and a
 * monitored door that's DOCK 05's door; another site's zone not edited through it, by a tampered
 * id; a batch from the gateway naming their codes; deleting refused once they hold measurements;
 * and the dock's live state on the door's card (that a unit that's no dock's door, or a tenant
 * without docks, has none is the docks module's `customer-docks.spec.ts`'s). The rest of what the
 * setup refuses (another tenant's site, units and zones of another site, deleting a measured door
 * or site) is `setup.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "#e2e/app.ts";

import {
	lastQuarter,
	postBatch,
	readingOf,
	riedel,
	setUpFromCustomer,
	shltrCustomer,
	shltrOwner,
} from "./helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: shltrOwner });

/** The energy site this file sets up, and the unit that's DOCK 05's door. */
let siteId = 0;
let dockDoor = 0;

const setupRow = (kind: string, key: string) => app.page.locator(`[data-setup-${kind}="${key}"]`);

describe("setting a site up", () => {
	test("from the customer's page: Weggemans' Barneveld gets an energy site", async () => {
		const weggemans = await shltrCustomer("Weggemans Logistiek");
		const barneveld = weggemans.site("Barneveld");
		siteId = await setUpFromCustomer(app.page, { code: weggemans.code, siteId: barneveld });
		expect(
			await rows(
				`select organization_id, site_id, name, meter_name, contracted_peak_kw, tariff, time_zone
				 from energy_site where id = ?`,
				[siteId],
			),
		).toEqual([
			{
				organization_id: shltr.id,
				site_id: barneveld,
				name: "Weggemans Logistiek — Barneveld",
				meter_name: "Main connection",
				contracted_peak_kw: 250,
				tariff: 0.28,
				time_zone: "Europe/Amsterdam",
			},
		]);
		// The customer's card now links to it, and offers it no more.
		await app.go(`/customers/${weggemans.code}`);
		const card = app.page.locator(`[data-energy-card-site="${barneveld}"]`);
		await card
			.getByRole("link", { name: "Weggemans Logistiek — Barneveld", exact: true })
			.waitFor();
		expect(await card.locator("[data-energy-add-site]").count()).toBe(0);
	});

	test("adds a zone, whose code is unique in the site", async () => {
		const { page } = app;
		await app.go(`/energy/${siteId}/setup`);
		await page.getByRole("button", { name: "Add zone" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Code").fill("Z-DOCK");
		await dialog.getByLabel("Name", { exact: true }).fill("Expeditie");
		await dialog.getByLabel("Floor").fill("Begane grond");
		await dialog.getByLabel("Area (m²)").fill("900");
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		await setupRow("zone", "Z-DOCK").waitFor();

		await page.getByRole("button", { name: "Add zone" }).click();
		await dialog.getByLabel("Code").fill("Z-DOCK");
		await dialog.getByLabel("Name", { exact: true }).fill("Again");
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		expect(await app.issues()).toContain("Another zone of this site has this code");
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "detached" });
		expect(
			await rows(`select code, name, floor, area_m2 from energy_zone where energy_site_id = ?`, [
				siteId,
			]),
		).toEqual([{ code: "Z-DOCK", name: "Expeditie", floor: "Begane grond", area_m2: 900 }]);
		// No thresholds until a day of readings (or a manager) sets them.
		expect(
			await value(
				`select count(*) from energy_threshold t join energy_zone z on z.id = t.zone_id
				 where z.energy_site_id = ?`,
				[siteId],
			),
		).toBe(0);
	});

	test("adds a consumer and a door that's a unit of the site: DOCK 05's door", async () => {
		const { page } = app;
		dockDoor = Number(
			await value(`select door_id from dock_position where organization_id = ? and code = ?`, [
				shltr.id,
				"DOCK 05",
			]),
		);
		await page.getByRole("button", { name: "Add consumer" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Name", { exact: true }).fill("Dockverwarming");
		await dialog.getByLabel("Rated power (kW)").fill("12");
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		await setupRow("consumer", "Dockverwarming").waitFor();

		await page.getByRole("button", { name: "Add door" }).click();
		await dialog.getByLabel("Code").fill("D-21");
		await dialog.getByLabel("Name", { exact: true }).fill("Sectionaaldeur Dock 05");
		await dialog.getByLabel("Loss while open (kW)").fill("11.4");
		await dialog.getByLabel("Inside (°C)").fill("18");
		await dialog.getByLabel("Unit").selectOption(String(dockDoor));
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		await setupRow("door", "D-21").waitFor();
		expect(await setupRow("door", "D-21").textContent()).toContain("Sectionaaldeur D-21");

		expect(
			await rows(
				`select d.code, d.kind, d.loss_kw, d.threshold_minutes, d.inside_c, d.outside_c,
					d.equipment_id, z.code as zone from energy_door d join energy_zone z on z.id = d.zone_id
				 where d.energy_site_id = ?`,
				[siteId],
			),
		).toEqual([
			{
				code: "D-21",
				kind: "sectional",
				loss_kw: 11.4,
				threshold_minutes: 10,
				inside_c: 18,
				outside_c: null,
				equipment_id: dockDoor,
				zone: "Z-DOCK",
			},
		]);
		expect(
			await rows(
				`select c.name, c.rated_kw from energy_consumer c join energy_zone z on z.id = c.zone_id
				 where z.energy_site_id = ?`,
				[siteId],
			),
		).toEqual([{ name: "Dockverwarming", rated_kw: 12 }]);
		// Logged on the site's card.
		await app.go(`/energy/${siteId}/setup`);
		await page.locator('[data-card="activity"]').getByText("D-21").first().waitFor();
	});

	test("can't edit another site's zone through this one", async () => {
		const { page } = app;
		const target = (await riedel()).zone("Z-R61");
		const before = await rows(`select * from energy_zone where id = ?`, [target.id]);
		await page.getByRole("button", { name: "Edit zone Z-DOCK" }).click();
		const dialog = page.getByRole("dialog");
		const hidden = dialog.locator('input[type="hidden"][name^="zoneId/"]');
		await expect.poll(() => hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);
			await dialog.getByLabel("Name", { exact: true }).fill("Tampered");
			return app.submit(dialog.getByRole("button", { name: "Save" }));
		});
		expect((JSON.parse(result) as { error?: { status?: number } }).error?.status).toBe(404);
		expect(await rows(`select * from energy_zone where id = ?`, [target.id])).toEqual(before);
		await page.keyboard.press("Escape");
	});

	test("the site's page shows it without any readings yet, in each scope and period", async () => {
		const { page } = app;
		await app.go("/energy");
		await page.locator(`[data-energy-site="${siteId}"]`).click();
		await page.waitForURL((url) => url.pathname === `/energy/${siteId}`);
		await page.locator('[data-zone="Z-DOCK"]').waitFor();
		expect(await page.locator('[data-zone="Z-DOCK"]').getAttribute("data-tone")).toBe("offline");
		expect(
			await page.locator('[data-kpi="consumption"] [data-slot="card-title"]').first().textContent(),
		).toBe("0 kWh");
		await page.locator('[data-zone="Z-DOCK"]').click();
		await page.waitForURL((url) => url.searchParams.get("scope") === "zone:Z-DOCK");
		await expect.poll(() => page.locator("[data-comparison] [data-zone-row]").count()).toBe(1);
		await page.locator('[data-period="month"]').click();
		await page.waitForURL((url) => url.searchParams.get("period") === "month");
		await page.locator('[data-kpi="consumption"]').getByText("Consumption this month").waitFor();
		await page.locator('[data-door="D-21"]').waitFor();
	});

	test("the gateway's batch names the new codes, and the settings page lists them", async () => {
		const { page } = app;
		const start = lastQuarter();
		const result = await postBatch({
			site: siteId,
			readings: [readingOf("Z-DOCK", start, 20)],
			doorEvents: [{ door: "D-21", at: start.toString(), state: "open" }],
		});
		expect(result).toMatchObject({ status: 200, body: { readings: 1, doorEvents: 1 } });

		await app.go("/energy/settings");
		const row = page.locator(`[data-site-codes="${siteId}"]`);
		expect(await row.textContent()).toContain("Z-DOCK");
		expect(await row.textContent()).toContain("D-21");
		await row.getByRole("link", { name: "Set up" }).click();
		await page.waitForURL((url) => url.pathname === `/energy/${siteId}/setup`);
	});
});

describe("deleting", () => {
	/** Asks to delete a row's record, and answers the dialog. */
	async function deleteRow(kind: string, key: string, title: string) {
		await setupRow(kind, key).getByRole("button", { name: title }).click();
		const dialog = app.page.getByRole("alertdialog");
		await app.expectingErrors(() => app.submit(dialog.getByRole("button", { name: "Delete" })));
		return dialog;
	}

	test("is refused for a zone once it holds measurements", async () => {
		const { page } = app;
		const dialog = await deleteRow("zone", "Z-DOCK", "Delete zone Z-DOCK?");
		await dialog.getByText("The zone has readings or alerts").waitFor();
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "detached" });
		expect(await value(`select count(*) from energy_zone where energy_site_id = ?`, [siteId])).toBe(
			1,
		);
	});
});

describe("the dock on the door's card", () => {
	/** DOCK 05's state as the board works it out, and the plate of the truck at it. */
	async function dock05() {
		const [found] = await rows<{
			id: number;
			site_id: number;
			locked: number;
			scp_online: number;
			plate: string | null;
			session: number | null;
		}>(
			`select d.id, d.site_id, s.locked, s.scp_online, x.plate, x.id as session
			 from dock_position d join dock_state s on s.dock_id = d.id
			 left join dock_session x on x.dock_id = d.id and x.checked_out_at is null
			 where d.organization_id = ? and d.code = 'DOCK 05'`,
			[shltr.id],
		);
		const state = !found.scp_online
			? "fault"
			: found.locked
				? "loading"
				: found.session
					? "occupied"
					: "free";
		return { ...found, state };
	}

	test("shows DOCK 05's live state, Wheel-Lok and plate, linking to the board", async () => {
		const { page } = app;
		const dock = await dock05();
		await app.go(`/energy/${siteId}`);
		const shown = page.locator('[data-door="D-21"] [data-door-dock="DOCK 05"]');
		await shown.waitFor();
		expect(await shown.locator("[data-dock-state]").getAttribute("data-dock-state")).toBe(
			dock.state,
		);
		expect(
			await shown.locator("[data-door-dock-locked]").getAttribute("data-door-dock-locked"),
		).toBe(String(Boolean(dock.locked)));
		if (dock.plate)
			expect(await shown.locator("[data-door-dock-plate]").textContent()).toBe(dock.plate);
		await shown.click();
		await page.waitForURL(
			(url) => url.pathname === "/docks" && url.searchParams.get("site") === String(dock.site_id),
		);
		await page.locator('[data-dock="DOCK 05"]').waitFor();
	});
});
