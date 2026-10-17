/**
 * Setting a site's energy monitoring up in the office, in SHLTR, as its owner: Weggemans' site in
 * Barneveld (where its Salvo docks are) from the customer's page, with a zone, a consumer and a
 * monitored door that's DOCK 05's door; a batch from the gateway naming their codes; deleting
 * refused once they hold measurements; and the dock's live state on the door's card, which isn't
 * there with the docks module off.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, quiet, rows, useApp, value } from "#e2e/app.ts";

import {
	lastQuarter,
	postBatch,
	readingOf,
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
		await page.locator('[data-scope="zone:Z-DOCK"]').click();
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
		expect(
			await value(
				`select count(*) from energy_reading r join energy_zone z on z.id = r.zone_id
				 where z.energy_site_id = ?`,
				[siteId],
			),
		).toBe(1);

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

	test("is refused for a zone, a door and the site once they hold measurements", async () => {
		const { page } = app;
		/** Closes the refusing dialog, and waits until it's gone. */
		const close = async (dialog: ReturnType<typeof page.getByRole>) => {
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached" });
		};
		let dialog = await deleteRow("zone", "Z-DOCK", "Delete zone Z-DOCK?");
		await dialog.getByText("The zone has readings or alerts").waitFor();
		await close(dialog);
		dialog = await deleteRow("door", "D-21", "Delete door D-21?");
		await dialog.getByText("The door has events or alerts").waitFor();
		await close(dialog);

		await page.getByRole("button", { name: "Delete", exact: true }).click();
		dialog = page.getByRole("alertdialog");
		await app.expectingErrors(() => app.submit(dialog.getByRole("button", { name: "Delete" })));
		await dialog.getByText("The site has readings, door events or alerts").waitFor();
		await close(dialog);
		expect(await value(`select count(*) from energy_zone where energy_site_id = ?`, [siteId])).toBe(
			1,
		);
		expect(await value(`select count(*) from energy_door where energy_site_id = ?`, [siteId])).toBe(
			1,
		);
		expect(await value(`select count(*) from energy_site where id = ?`, [siteId])).toBe(1);
	});

	test("a consumer, which measures nothing, goes", async () => {
		await deleteRow("consumer", "Dockverwarming", "Delete Dockverwarming?");
		await setupRow("consumer", "Dockverwarming").waitFor({ state: "detached" });
		expect(
			await value(
				`select count(*) from energy_consumer c join energy_zone z on z.id = c.zone_id
				 where z.energy_site_id = ?`,
				[siteId],
			),
		).toBe(0);
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

	test("isn't on a door whose unit is no dock's door: Riedel's freezer door", async () => {
		const { page } = app;
		const riedel = Number(
			await value(`select id from energy_site where organization_id = ? order by id limit 1`, [
				shltr.id,
			]),
		);
		await app.go(`/energy/${riedel}`);
		// The freezer's door is linked to one of Riedel's units, which docks don't have.
		await page.locator('[data-door="D-VR1"]').getByRole("link").waitFor();
		await page.locator('[data-door="D-05"]').waitFor();
		await quiet(page);
		expect(await page.locator("[data-door-dock]").count()).toBe(0);
	});

	test("isn't there with the docks module off, and is back when it's on", async () => {
		const { page } = app;
		const docksCard = page.locator('[data-module="docks"]');
		await app.go("/settings");
		await app.submit(docksCard.getByRole("button", { name: "Disable" }));
		await docksCard.getByText("Disabled").waitFor();
		try {
			await app.go(`/energy/${siteId}`);
			await page
				.locator('[data-door="D-21"]')
				.getByRole("link", { name: "Sectionaaldeur D-21" })
				.waitFor();
			await quiet(page);
			expect(await page.locator("[data-door-dock]").count()).toBe(0);
		} finally {
			await app.go("/settings");
			await app.submit(docksCard.getByRole("button", { name: "Enable" }));
			await docksCard.getByText(/Enabled since/).waitFor();
		}
		await app.go(`/energy/${siteId}`);
		await page.locator('[data-door="D-21"] [data-door-dock="DOCK 05"]').waitFor();
	});
});
