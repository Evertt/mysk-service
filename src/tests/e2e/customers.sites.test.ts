import { describe, expect, test } from "vite-plus/test";

import { formatTimeSlot } from "#lib/i18n/format.ts";

import { organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

interface Site {
	id: number;
	customer_id: number;
	name: string;
	address: string;
	postal_code: string;
	city: string;
	slot_start: string | null;
	slot_end: string | null;
	access_notes: string | null;
	units: number;
}

/** A tenant's sites with how many units are at each. */
const sitesWhere = (where: string, args: (string | number)[]) =>
	rows<Site>(
		`select s.id, s.customer_id, s.name, s.address, s.postal_code, s.city, s.slot_start, s.slot_end,
		 s.access_notes, (select count(*) from equipment e where e.site_id = s.id) as units
		 from customer_site s where ${where} order by s.name, s.id`,
		args,
	);

const site = (id: number) => rows(`select * from customer_site where id = ?`, [id]);
const codeOf = (customerId: number) =>
	value<string>(`select code from customer where id = ?`, [customerId]);

/** North's customer with the most sites (and access notes at one), whose page the tests use. */
const busiestCustomer = () =>
	value<number>(
		`select customer_id from customer_site where organization_id = ? group by customer_id
		 order by count(*) desc, count(access_notes) desc, customer_id limit 1`,
		[north.id],
	);

const sitesCard = () => app.page.getByTestId("sites");
const siteRow = (id: number) => sitesCard().locator(`[data-site="${id}"]`);

/** Opens a site's menu on the card and picks one of its items. */
async function siteAction(name: string, item: "Edit" | "Delete") {
	await app.page.getByRole("button", { name: `Actions for ${name}` }).click();
	await app.page.getByRole("menuitem", { name: item }).click();
}

let customer: number;
let code: string;
/** The site added in North, deleted again at the end. */
let added: number;

describe("in North", () => {
	test("a customer's page lists their sites, with their units, time slots and access notes", async () => {
		customer = await busiestCustomer();
		code = await codeOf(customer);
		const sites = await sitesWhere("s.customer_id = ?", [customer]);
		expect(sites.length).toBeGreaterThan(1);
		await app.go(`/customers/${code}`);
		for (const each of sites) {
			const text = await siteRow(each.id).innerText();
			expect(text).toContain(each.name);
			expect(text).toContain(each.address);
			expect(text).toContain(`${each.postal_code} ${each.city}`);
			expect(text).toMatch(new RegExp(`\\b${each.units} equipment units?\\b`));
			expect(text).toContain(
				each.slot_start && each.slot_end
					? formatTimeSlot(each.slot_start, each.slot_end, "en")
					: "No preference",
			);
			if (each.access_notes) expect(text).toContain(each.access_notes);
		}
		// The equipment table says where each unit is.
		const [unit] = await rows<{ serial_number: string; site: string }>(
			`select e.serial_number, s.name as site from equipment e join customer_site s on s.id = e.site_id
			 where e.customer_id = ? order by e.id limit 1`,
			[customer],
		);
		const row = app.page.getByRole("row", { name: new RegExp(unit.serial_number) });
		expect(await row.innerText()).toContain(unit.site);
	});

	// What a site needs (its time slot's both ends, the end after the start), editing it and the
	// refusal to delete one with equipment are `site-schema.spec.ts`'s and `sites.spec.ts`'s.
	test("a new site is the customer's, logged against them", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Add site" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("New site").waitFor();
		// It starts in the customer's town and country.
		const [owner] = await rows<{ city: string; country: string }>(
			`select city, country from customer where id = ?`,
			[customer],
		);
		expect(await dialog.getByLabel("City").inputValue()).toBe(owner.city);
		expect(await dialog.getByLabel("Country").inputValue()).toBe(owner.country);

		await dialog.getByLabel("Name", { exact: true }).fill("Distributiecentrum Ede");
		await dialog.getByLabel("Street address").fill("Galvanistraat 1");
		await dialog.getByLabel("Postal code").fill("6716 AE");
		await dialog.getByLabel("City").fill("Ede");
		await dialog.getByLabel("Available from").fill("07:00");
		await dialog.getByLabel("Available until").fill("15:00");
		await dialog.getByLabel("Contact by").selectOption("whatsapp");
		await dialog.getByLabel("Preferred day").selectOption("tuesday");
		await dialog
			.getByLabel("Access notes")
			.fill("Werk buiten productietijden; melden bij receptie expeditie noord.");
		await dialog.getByRole("button", { name: "Save site" }).click();
		await app.toast("Site saved");
		await dialog.waitFor({ state: "detached" });

		const [stored] = await rows<Record<string, unknown>>(
			`select * from customer_site where customer_id = ? and name = 'Distributiecentrum Ede'`,
			[customer],
		);
		expect(stored).toMatchObject({
			organization_id: north.id,
			address: "Galvanistraat 1",
			postal_code: "6716 AE",
			city: "Ede",
			contact_channel: "whatsapp",
			preferred_day: "tuesday",
			slot_start: "07:00",
			slot_end: "15:00",
			priority: "normal",
			access_notes: "Werk buiten productietijden; melden bij receptie expeditie noord.",
			contact_name: null,
		});
		added = stored.id as number;
		const text = await siteRow(added).innerText();
		expect(text).toContain("07:00–15:00");
		expect(text).toContain("Tuesday");
		expect(text).toContain("WhatsApp");
		expect(text).toContain("0 equipment units");
		expect(
			await rows(
				`select action, subject_label, parent_type, parent_id from activity
				 where subject_type = 'site' and subject_id = ?`,
				[String(added)],
			),
		).toEqual([
			{
				action: "created",
				subject_label: "Distributiecentrum Ede",
				parent_type: "customer",
				parent_id: String(customer),
			},
		]);
	});

	// Also the cleanup: the lane's later files find the customer's sites as seeded.
	test("deleting the site without equipment removes it, and logs it", async () => {
		const { page } = app;
		await siteAction("Distributiecentrum Ede", "Delete");
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await app.toast("Site deleted");
		await expect.poll(() => siteRow(added).count()).toBe(0);
		expect(await site(added)).toEqual([]);
		expect(
			await value(
				`select action from activity where subject_type = 'site' and subject_id = ? order by id desc`,
				[String(added)],
			),
		).toBe("deleted");
	});
});

describe("in South", () => {
	/** One of North's sites, to tamper with from South. */
	let target: number;
	let targetBefore: unknown;

	test("a South customer's page shows their own sites only", async () => {
		await app.switchOrganization(south.name);
		target = await value<number>(`select min(id) from customer_site where organization_id = ?`, [
			north.id,
		]);
		targetBefore = await site(target);
		const own = await value<number>(`select min(id) from customer where organization_id = ?`, [
			south.id,
		]);
		code = await codeOf(own);
		customer = own;
		await app.go(`/customers/${code}`);
		const shown = await sitesCard()
			.locator("[data-site]")
			.evaluateAll((items) => items.map((item) => Number(item.getAttribute("data-site"))));
		expect(shown).toEqual((await sitesWhere("s.customer_id = ?", [own])).map((each) => each.id));
	});

	test("editing with the id of a North site is refused", async () => {
		const { page } = app;
		const [ownSite] = await sitesWhere("s.customer_id = ?", [customer]);
		const ownBefore = await site(ownSite.id);
		await siteAction(ownSite.name, "Edit");
		const dialog = page.getByRole("dialog");
		const hidden = dialog.locator('input[type="hidden"][name^="id/"]');
		await expect.poll(() => hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target);
			await dialog.getByLabel("Name", { exact: true }).fill("Tampered");
			return app.submit(dialog.getByRole("button", { name: "Save site" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await site(target)).toEqual(targetBefore);
		expect(await site(ownSite.id)).toEqual(ownBefore);
		await page.keyboard.press("Escape");
	});

	// Deleting by a North site's id, and adding a site to a North customer by theirs, are
	// `sites.spec.ts`'s ("another tenant's site or customer is a 404").
});
