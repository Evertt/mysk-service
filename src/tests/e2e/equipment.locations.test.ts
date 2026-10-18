import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";
import { equipmentPage } from "./equipment-helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { bodyRows, card } = equipmentPage(app);

interface Location {
	id: number;
	site_id: number;
	name: string;
	description: string | null;
	position: number;
	units: number;
}

/** The locations for which `where` holds, with how many units are at each, in their order. */
const locationsWhere = (where: string, args: (string | number)[]) =>
	rows<Location>(
		`select l.id, l.site_id, l.name, l.description, l.position,
		 (select count(*) from equipment e where e.location_id = l.id) as units
		 from equipment_location l join customer_site s on s.id = l.site_id where ${where}
		 order by l.site_id, l.position, l.id`,
		args,
	);
const location = (id: number) => rows(`select * from equipment_location where id = ?`, [id]);

/** North's customer with the most locations, at more than one site. */
const busiestCustomer = () =>
	value<number>(
		`select s.customer_id from equipment_location l join customer_site s on s.id = l.site_id
		 where l.organization_id = ? group by s.customer_id having count(distinct s.id) > 1
		 order by count(*) desc, s.customer_id limit 1`,
		[north.id],
	);

const locationRow = (id: number) => app.page.locator(`[data-location="${id}"]`);

/** Opens a location's menu on the sites card and picks one of its items. */
async function locationAction(name: string, item: "Edit" | "Delete") {
	await app.page.getByRole("button", { name: `Actions for location ${name}` }).click();
	await app.page.getByRole("menuitem", { name: item }).click();
}

let customer: number;
let code: string;
/** The site the tests add a location to, and the location added. */
let siteId: number;
let added: number;

describe("in North", () => {
	test("the sites card lists each site's locations with their units", async () => {
		customer = await busiestCustomer();
		code = await value<string>(`select code from customer where id = ?`, [customer]);
		const locations = await locationsWhere("s.customer_id = ?", [customer]);
		await app.go(`/customers/${code}`);
		for (const each of locations) {
			const text = await locationRow(each.id).innerText();
			expect(text).toContain(each.name);
			expect(text).toMatch(new RegExp(`\\b${each.units} units?\\b`));
		}
		// Each under its own site.
		const [first] = locations;
		expect(
			await app.page
				.locator(`[data-site="${first.site_id}"] [data-location="${first.id}"]`)
				.count(),
		).toBe(1);
		siteId = first.site_id;
	});

	// What a new location needs (a name the site hasn't got yet, in any case), renaming one and
	// the refusal to delete one with units are `locations.spec.ts`'s and `location-schema.spec.ts`'s.
	test("a new location comes last at its site, with a QR token, logged against the customer", async () => {
		const { page } = app;
		await page
			.locator(`[data-site="${siteId}"]`)
			.getByRole("button", { name: "Add location" })
			.click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("New location").waitFor();
		const before = await locationsWhere("l.site_id = ?", [siteId]);
		await dialog.getByLabel("Name").fill("Expeditie noord");
		await dialog.getByLabel("Description").fill("Achter de kantine");
		await dialog.getByRole("button", { name: "Save location" }).click();
		await app.toast("Location saved");
		await dialog.waitFor({ state: "detached" });
		const [stored] = await rows<Record<string, unknown>>(
			`select * from equipment_location where site_id = ? and name = 'Expeditie noord'`,
			[siteId],
		);
		expect(stored).toMatchObject({
			organization_id: north.id,
			description: "Achter de kantine",
			position: Math.max(...before.map((each) => each.position)) + 1,
		});
		expect(stored.qr_token).toMatch(/^[0-9a-f]{24}$/);
		added = stored.id as number;
		await expect.poll(() => locationRow(added).innerText()).toContain("0 units");
		expect(
			await rows(
				`select action, subject_label, parent_type, parent_id from activity
				 where subject_type = 'location' and subject_id = ?`,
				[String(added)],
			),
		).toEqual([
			{
				action: "created",
				subject_label: "Expeditie noord",
				parent_type: "customer",
				parent_id: String(customer),
			},
		]);
	});

	test("a location's page shows its units, their orders and its QR code", async () => {
		const [busy] = await rows<{ id: number; name: string }>(
			`select l.id, l.name from equipment_location l where l.organization_id = ?
			 and exists (select 1 from equipment e join order_unit ou on ou.equipment_id = e.id
			 where e.location_id = l.id) order by l.id limit 1`,
			[north.id],
		);
		const units = await rows<{ serial_number: string }>(
			`select serial_number from equipment where location_id = ?`,
			[busy.id],
		);
		const [latest] = await rows<{ number: string }>(
			`select o.number from "order" o join order_unit ou on ou.order_id = o.id
			 join equipment e on e.id = ou.equipment_id where e.location_id = ?
			 order by o.created_at desc, o.id desc limit 1`,
			[busy.id],
		);
		await app.go(`/equipment/locations/${busy.id}`);
		await app.page.getByRole("heading", { name: busy.name }).waitFor();
		const shown = await app.page.getByTestId("location-units").innerText();
		for (const unit of units) expect(shown).toContain(unit.serial_number);
		expect(await app.page.getByTestId("location-history").innerText()).toContain(latest.number);
		const token = await value<string>(`select qr_token from equipment_location where id = ?`, [
			busy.id,
		]);
		const code = app.page.getByTestId("qr-card").locator("svg[data-qr]");
		expect(await code.getAttribute("data-qr")).toMatch(new RegExp(`/q/${token}$`));
	});

	test("the equipment form picks the location among its site's", async () => {
		const { page } = app;
		// A unit at a site with two locations or more, at one of them.
		const [unit] = await rows<{ id: number; serial: string; site_id: number; location_id: number }>(
			`select e.id, e.serial_number as serial, e.site_id, e.location_id from equipment e
			 where e.organization_id = ? and e.location_id is not null
			 and (select count(*) from equipment_location l where l.site_id = e.site_id) > 1
			 order by e.id limit 1`,
			[north.id],
		);
		const atSite = await locationsWhere("l.site_id = ?", [unit.site_id]);
		const other = atSite.find((each) => each.id !== unit.location_id)!;
		await app.go(`/equipment/${unit.serial}/edit`);
		const select = page.getByLabel("Location at the site");
		expect(await select.inputValue()).toBe(String(unit.location_id));
		expect(await select.locator("option").allInnerTexts()).toEqual([
			"No location",
			...atSite.map((each) => each.name),
			"Add a location…",
		]);
		await select.selectOption(String(other.id));
		await page.getByRole("button", { name: "Save equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${unit.serial}`);
		await quietCard();
		expect(await value(`select location_id from equipment where id = ?`, [unit.id])).toBe(other.id);
		expect(await card("Specifications")).toContain(other.name);
		const [logged] = await rows<{ changes: string }>(
			`select changes from activity where subject_type = 'equipment' and subject_id = ?
			 order by id desc limit 1`,
			[String(unit.id)],
		);
		expect(JSON.parse(logged.changes)).toEqual({ locationId: [unit.location_id, other.id] });

		// The list filters by it, and finds its units by its name.
		await app.go(`/equipment?location=${other.id}`);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(other.units + 1);
		expect(await app.filterPill("Location").innerText()).toContain(other.name);
		await app.go(`/equipment?q=${encodeURIComponent(other.name)}&location=${other.id}`);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(other.units + 1);
		expect(await bodyRows().first().innerText()).toContain(other.name);
	});

	test("a site's label sheet has a QR code for each of its locations and units", async () => {
		const locations = await locationsWhere("l.site_id = ?", [siteId]);
		const units = await value<number>(`select count(*) from equipment where site_id = ?`, [siteId]);
		await app.go(`/customers/${code}`);
		await app.page
			.locator(`[data-site="${siteId}"]`)
			.getByRole("link", { name: "QR labels" })
			.click();
		await app.page.waitForURL((url) => url.pathname === `/equipment/labels/${siteId}`);
		const sheet = app.page.getByTestId("label-sheet");
		await sheet.waitFor();
		expect(await sheet.locator('[data-label="location"]').count()).toBe(locations.length);
		expect(await sheet.locator('[data-label="unit"]').count()).toBe(units);
		// Each code holds its record's link, and is drawn.
		const tokens = (
			await rows<{ qr_token: string }>(
				`select qr_token from equipment_location where site_id = ? union all
				 select qr_token from equipment where site_id = ?`,
				[siteId, siteId],
			)
		).map((row) => row.qr_token);
		const codes = await sheet.locator("svg[data-qr]").evaluateAll((svgs) =>
			svgs.map((svg) => ({
				token: svg.getAttribute("data-qr")!.split("/q/")[1],
				drawn: (svg.querySelector("path")?.getAttribute("d")?.length ?? 0) > 100,
			})),
		);
		expect(codes.map((each) => each.token).sort()).toEqual(tokens.sort());
		expect(codes.every((each) => each.drawn)).toBe(true);
	});

	test("a unit's page prints its own label", async () => {
		const [unit] = await rows<{ serial: string; site_id: number }>(
			`select serial_number as serial, site_id from equipment where site_id = ? limit 1`,
			[siteId],
		);
		await app.go(`/equipment/${unit.serial}`);
		await app.page.getByTestId("qr-card").getByRole("link", { name: "Print label" }).click();
		await app.page.waitForURL((url) => url.searchParams.get("unit") === unit.serial);
		const sheet = app.page.getByTestId("label-sheet");
		await sheet.waitFor();
		expect(await sheet.locator("[data-label]").count()).toBe(1);
		expect(await sheet.innerText()).toContain(unit.serial);
	});

	test("deleting the location without units removes it, and logs it", async () => {
		const { page } = app;
		await app.go(`/customers/${code}`);
		await locationAction("Expeditie noord", "Delete");
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await app.toast("Location deleted");
		await expect.poll(() => locationRow(added).count()).toBe(0);
		expect(await location(added)).toEqual([]);
		expect(
			await value(
				`select action from activity where subject_type = 'location' and subject_id = ? order by id desc`,
				[String(added)],
			),
		).toBe("deleted");
	});
});

/** Waits for the unit's page to have its specifications. */
const quietCard = () => app.page.getByText("Specifications", { exact: true }).waitFor();

describe("in South", () => {
	// North's ids in South's location forms are `locations.spec.ts`'s ("another tenant's sites and
	// locations are a 404, also by their ids", "a unit's location must be at its own site").
	test("North's locations and label sheets are a 404", async () => {
		await app.switchOrganization(south.name);
		const target = await value<number>(
			`select min(id) from equipment_location where organization_id = ?`,
			[north.id],
		);
		const site = await value<number>(`select site_id from equipment_location where id = ?`, [
			target,
		]);
		expect((await app.go(`/equipment/locations/${target}`))?.status()).toBe(404);
		expect((await app.go(`/equipment/labels/${site}`))?.status()).toBe(404);
	});
});
