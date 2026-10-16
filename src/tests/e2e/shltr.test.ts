/**
 * The SHLTR demo organization (`src/lib/server/db/seed/shltr/`): its planner sees SHLTR's own
 * world, the mockup's customers with their sites' preferences, its units and a planned month, and
 * the Fieldworks tenants see none of it.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatTimeSlot } from "#lib/i18n/format.ts";

import { afresh, countIn, organizations, rows, useApp, users, value } from "./app.ts";

const { north, shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

/** One of SHLTR's customers, by name. */
const customerNamed = async (name: string) =>
	(
		await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? and name = ?`,
			[shltr.id, name],
		)
	)[0];

/** The mockup's fire door at Riedel, which only SHLTR has. */
const fireDoor = () =>
	value<string>(`select serial_number from equipment where organization_id = ? and name = ?`, [
		shltr.id,
		"BRD-Brandwerend deur Amoniak ruimte TDTE-01",
	]);

describe("SHLTR's planner", () => {
	test("works in SHLTR, which lists SHLTR's customers", async () => {
		const { page } = app;
		expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(shltr.name);
		await app.go(afresh("/customers"));
		expect(await app.rowCount()).toBe(await countIn("customer", shltr.id));
		for (const name of ["Riedel B.V.", "Weggemans Logistiek", "Pakhuis 7"]) {
			await page.getByRole("link", { name, exact: true }).first().waitFor();
		}
	});

	test("a customer's site shows its time slot and access notes, and its units their names", async () => {
		const { page } = app;
		const riedel = await customerNamed("Riedel B.V.");
		const [site] = await rows<{ id: number; access_notes: string }>(
			`select id, access_notes from customer_site where customer_id = ?`,
			[riedel.id],
		);
		await app.go(`/customers/${riedel.code}`);
		const row = page.getByTestId("sites").locator(`[data-site="${site.id}"]`);
		const text = await row.innerText();
		expect(text).toContain("Frankeneng 12");
		expect(text).toContain("6717 AG Ede");
		expect(text).toContain(formatTimeSlot("07:00", "15:00", "en"));
		expect(site.access_notes).toBe(
			"Werk buiten productietijden; melden bij receptie expeditie noord.",
		);
		expect(text).toContain(site.access_notes);
		await page.getByText("BRD-Brandwerend deur Amoniak ruimte TDTE-01").first().waitFor();
	});

	test("the schedule's month is SHLTR's orders, plenty of them", async () => {
		const { page } = app;
		await app.go("/schedule?view=month");
		const month = page.locator('section[aria-label="Month"]');
		await month.waitFor();
		const shown = await month
			.locator("[data-order]")
			.evaluateAll((links) => links.map((link) => link.getAttribute("data-order")!));
		// Every working day has work, so the calendar shows two or three orders on most of its days.
		expect(shown.length).toBeGreaterThan(40);
		const numbers = new Set(
			(
				await rows<{ number: string }>(
					`select number from "order" where organization_id = ? and scheduled_for is not null`,
					[shltr.id],
				)
			).map((row) => row.number),
		);
		expect(shown.filter((number) => !numbers.has(number))).toEqual([]);
	});
});

describe("SHLTR's engineer", () => {
	test("lands on the portal, with Lev's work for today", async () => {
		const { page } = app;
		await page.context().clearCookies();
		await app.signIn(users.shltrEngineer);
		expect(app.path()).toBe("/my");
		const today = await page
			.getByRole("region", { name: "Today", exact: true })
			.locator("[data-order]")
			.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-order")!));
		expect(today.length).toBeGreaterThanOrEqual(2);
		const lev = await rows<{ number: string }>(
			`select o.number from "order" o join engineer e on e.id = o.engineer_id
			 where e.organization_id = ? and e.name like 'Lev %'`,
			[shltr.id],
		);
		const his = new Set(lev.map((o) => o.number));
		expect(today.filter((number) => !his.has(number))).toEqual([]);
	});
});

describe("in North", () => {
	test("none of SHLTR's customers or units are there", async () => {
		const { page } = app;
		await page.context().clearCookies();
		await app.signIn(users.admin);
		expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(north.name);
		await app.go(afresh("/customers"));
		expect(await app.rowCount()).toBe(await countIn("customer", north.id));
		await page.getByLabel("Search customers…").fill("Riedel");
		await page.getByText("No customers found").waitFor();
		// Nor its unit, by its page.
		expect((await app.go(`/equipment/${await fireDoor()}`))?.status()).toBe(404);
	});

	test("SHLTR isn't among the admin's organizations", async () => {
		const { page } = app;
		await app.go("/");
		await page.locator('[data-sidebar="header"] button').first().click();
		const names = await page.getByRole("menuitem").allInnerTexts();
		expect(names.some((name) => name.includes(north.name))).toBe(true);
		expect(names.some((name) => name.includes(shltr.name))).toBe(false);
		await page.keyboard.press("Escape");
	});
});
