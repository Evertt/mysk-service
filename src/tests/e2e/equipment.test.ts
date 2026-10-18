import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value, quiet } from "./app.ts";
import { busiest, equipmentPage, unitId } from "./equipment-helpers.ts";

const { north } = organizations;
const app = useApp();
const { bodyRows, card, shownTimeline } = equipmentPage(app);

const serial = "ZZ-TEST-0001";

/** The choices of the form's category select, without its placeholder. */
const categoryChoices = async () =>
	(await app.page.getByLabel("Category").locator("option").allInnerTexts()).slice(1);

/** The names of an organization's categories, in its order. */
const categoryNames = async (organizationId: string) =>
	(
		await rows<{ name: string }>(
			`select name from equipment_category where organization_id = ? order by position, id`,
			[organizationId],
		)
	).map((row) => row.name);

/** The choices of the form's site select, as it shows them. */
const siteChoices = () =>
	app.page.getByLabel("Site", { exact: true }).locator("option").allInnerTexts();

/** How the site select names a site: by its name, and its town if the name lacks it. */
const siteLabel =
	"case when instr(s.name, s.city) > 0 then s.name else s.name || ' (' || s.city || ')' end";

/** A North customer with several sites, and those sites as the form lists them. */
let multiSite: { id: number; sites: string[]; names: string[] };
const findMultiSite = async () => {
	const id = await value<number>(
		`select customer_id from customer_site where organization_id = ?
		 group by customer_id having count(*) > 1 order by customer_id limit 1`,
		[north.id],
	);
	const sites = await rows<{ label: string; name: string }>(
		`select ${siteLabel} as label, name from customer_site s where customer_id = ? order by name, id`,
		[id],
	);
	return { id, sites: sites.map((site) => site.label), names: sites.map((site) => site.name) };
};

/** A North customer with one site (not `multiSite`), and that site. */
let oneSite: { id: number; siteId: number; site: string };
const findOneSite = async () => {
	const [found] = await rows<{ id: number; siteId: number; site: string }>(
		`select customer_id as id, min(id) as siteId, min(name) as site from customer_site
		 where organization_id = ? group by customer_id having count(*) = 1 order by customer_id limit 1`,
		[north.id],
	);
	return found;
};

describe("in North", () => {
	beforeAll(async () => {
		[multiSite, oneSite] = await Promise.all([findMultiSite(), findOneSite()]);
	});

	test("registering a unit validates it first", async () => {
		const { page } = app;
		const before = await countIn("equipment", north.id);
		await app.go("/equipment/new");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		expect((await app.issues()).length).toBeGreaterThanOrEqual(5);
		expect(await app.issues()).toContain("Choose a site");
		// Without a customer, there's no site to choose.
		expect(await siteChoices()).toEqual(["Choose the customer first"]);

		// A serial number North already has, in lower case, and a warranty ending before installation.
		const { serial: busy } = await busiest(north.id);
		await page.getByLabel("Serial number").fill(busy.toLowerCase());
		await page.getByLabel("Manufacturer").fill("Testco");
		await page.getByLabel("Model").fill("TX-1");
		// North's own categories, in its order.
		expect(await categoryChoices()).toEqual(await categoryNames(north.id));
		await page.getByLabel("Category").selectOption({ label: "Koelmachine" });
		await page.getByLabel("Customer").selectOption(String(multiSite.id));
		// The customer's sites to choose from, theirs only.
		expect((await siteChoices()).slice(1)).toEqual(multiSite.sites);
		await page.getByLabel("Site", { exact: true }).selectOption({ label: multiSite.sites[1] });
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
			await rows(
				`select e.organization_id, e.customer_id, s.name as site, e.name, e.location_id as location
				 from equipment e join customer_site s on s.id = e.site_id where e.serial_number = ?`,
				[serial],
			),
		).toEqual([
			{
				organization_id: north.id,
				customer_id: multiSite.id,
				site: multiSite.names[1],
				name: null,
				location: null,
			},
		]);
		expect(await page.getByText("No orders yet").count()).toBe(1);
		expect(await card("Specifications")).toContain(multiSite.names[1]);
		expect(await shownTimeline()).toEqual(["warranty", "installation"]);
		expect(await card("Last service")).toContain("Never");
	});

	test("editing it saves the changes, including another customer", async () => {
		const { page } = app;
		const id = await unitId(serial, north.id);
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		expect(await page.getByLabel("Model").inputValue()).toBe("TX-1");
		expect(await page.getByLabel("Installed on").inputValue()).toBe("2026-01-10");
		const customer = await page.getByLabel("Customer").inputValue();

		await page.getByLabel("Model").fill("TX-2");
		await page.getByLabel("Status").selectOption("needs_service");
		// To a customer with one site: it's chosen at once.
		await page.getByLabel("Customer").selectOption(String(oneSite.id));
		const moved = await page.getByLabel("Customer").inputValue();
		expect(moved).not.toBe(customer);
		expect(await page.getByLabel("Site", { exact: true }).inputValue()).toBe(
			String(oneSite.siteId),
		);
		await page.getByLabel("Name", { exact: true }).fill("Automatische deur kantine BES-3");
		// A location the site doesn't have yet, added on the spot.
		await page.getByLabel("Location at the site").selectOption({ label: "Add a location…" });
		await page.getByLabel("New location").fill("Expeditie dock 07");
		await page.getByRole("button", { name: "Save equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
		// Its own name first, its make after it.
		await page.getByRole("heading", { name: "Automatische deur kantine BES-3" }).waitFor();
		expect(await page.locator("main").innerText()).toContain("Testco TX-2");
		expect(await card("Specifications")).toContain("Expeditie dock 07");
		const [saved] = await rows(
			`select e.model, e.status, e.customer_id, e.site_id, e.name, l.name as location
			 from equipment e left join equipment_location l on l.id = e.location_id
			 and l.site_id = e.site_id where e.id = ?`,
			[id],
		);
		expect(saved).toEqual({
			model: "TX-2",
			status: "needs_service",
			customer_id: Number(moved),
			site_id: oneSite.siteId,
			name: "Automatische deur kantine BES-3",
			location: "Expeditie dock 07",
		});
	});

	test("the list shows its name, site and location, and finds it by them", async () => {
		const { page } = app;
		await app.go(`/equipment?q=${encodeURIComponent("kantine BES-3")}`);
		await expect.poll(() => bodyRows().count()).toBe(1);
		const row = await bodyRows().first().innerText();
		expect(row).toContain("Automatische deur kantine BES-3");
		expect(row).toContain(`Testco TX-2 · ${serial}`);
		expect(row).toContain(oneSite.site);
		expect(row).toContain("Expeditie dock 07");
		await page.getByLabel("Search equipment…").fill("Expeditie dock 07");
		await expect
			.poll(() => bodyRows().allInnerTexts())
			.toContainEqual(expect.stringContaining(serial));
		await app.go(`/equipment/${serial}`);
	});

	// The bulk actions are equipment.list's ("selecting all the loaded units…"); skipping a unit
	// the change refuses, with the reason, is `bulk.spec.ts`'s.

	test("deleting it removes it, after which it's a 404", async () => {
		const { page } = app;
		/** The arguments of the queries the page asks for, as sent. */
		const asked: string[] = [];
		const record = (request: { url(): string; method(): string }) => {
			const url = new URL(request.url());
			if (!url.pathname.includes("/_app/remote/") || request.method() !== "GET") return;
			asked.push(Buffer.from(url.searchParams.get("payload") ?? "", "base64url").toString());
		};
		page.on("request", record);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/equipment");
		// The list, not an error page: the page being left, asking for its queries again, asked for
		// the unit with the list's params (no serial), and its 400 became the page's error.
		await expect
			.poll(async () => (await page.locator("main").innerText()).replace(/\s+/g, " "))
			.toContain("Installed units across all customer sites.");
		await app.tableSettled();
		page.off("request", record);
		// Nor does it ask about the unit again: it would only hear it's gone, and the parts of the
		// page that show their errors (the modules' slots) would.
		expect(asked.filter((argument) => argument.includes(serial))).toEqual([]);
		expect(await unitId(serial, north.id)).toBeUndefined();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
	});
});
