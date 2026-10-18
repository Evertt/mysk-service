/**
 * The SHLTR demo organization (`src/lib/server/db/seed/shltr/`): its planner sees SHLTR's own
 * world, and the Fieldworks tenants see none of it. What the seed holds (the mockup's customers
 * with their sites' preferences, a planned month, its engineers' days) is `seed/shltr.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { afresh, baseURL, countIn, organizations, useApp, users, value } from "./app.ts";

const { north, shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

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

	test("the order types go by SHLTR's names, without damage on the form", async () => {
		const { page } = app;
		const speak = (locale: "en" | "nl") =>
			page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL }]);
		await speak("nl");
		try {
			await app.go("/orders/new");
			const options = await page.getByLabel("Type").locator("option").allInnerTexts();
			expect(options).toEqual(expect.arrayContaining(["Storing", "Offerte-opname"]));
			expect(options).not.toContain("Offerte opname");
			expect(options).not.toContain("Schade");
			// A damage order keeps its type.
			const damage = await value<string>(
				`select number from "order" where organization_id = ? and type = 'damage' limit 1`,
				[shltr.id],
			);
			await app.go(`/orders/${damage}`);
			expect(await page.locator("main").innerText()).toContain("Schade");
		} finally {
			await speak("en");
		}
	});
});

describe("in North", () => {
	test("none of SHLTR's customers or units are there, and SHLTR isn't among the admin's organizations", async () => {
		const { page } = app;
		await page.context().clearCookies();
		await app.signIn(users.admin);
		expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(north.name);
		await page.locator('[data-sidebar="header"] button').first().click();
		const names = await page.getByRole("menuitem").allInnerTexts();
		expect(names.some((name) => name.includes(north.name))).toBe(true);
		expect(names.some((name) => name.includes(shltr.name))).toBe(false);
		await page.keyboard.press("Escape");

		await app.go(afresh("/customers"));
		expect(await app.rowCount()).toBe(await countIn("customer", north.id));
		await page.getByLabel("Search customers…").fill("Riedel");
		await page.getByText("No customers found").waitFor();
		// Nor its unit, by its page.
		expect((await app.go(`/equipment/${await fireDoor()}`))?.status()).toBe(404);
	});
});
