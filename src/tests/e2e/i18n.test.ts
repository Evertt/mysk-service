import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "../src/lib/server/db/demo.ts";
import { hydrated, organizations, useApp, users } from "./app.ts";

const app = useApp({ user: null });

/** The language the page is rendered in, and the one remembered in Paraglide's cookie. */
const language = async () => ({
	html: await app.page.evaluate(() => document.documentElement.lang),
	cookie: (await app.page.context().cookies()).find((c) => c.name === "PARAGLIDE_LOCALE")?.value,
});

/** Picks a language from a language menu, and waits for the page to reload in it. */
async function choose(name: string, locale: string) {
	await app.page.getByRole("menuitemradio", { name }).click();
	// The switch reloads the page: while the document is replaced there is no root element yet.
	await app.page.waitForFunction((lang) => document.documentElement?.lang === lang, locale);
	await hydrated(app.page);
}

/** Dutch puts a no-break space after the euro sign. */
const text = async (locator: ReturnType<typeof app.page.getByText>) =>
	(await locator.innerText()).replaceAll(" ", " ").trim();

const dutchDate = /^\d{1,2} (jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec) \d{4}$/;

describe("in Dutch", () => {
	test("the login page offers the languages, and switches to Dutch", async () => {
		const { page } = app;
		await app.go("/login");
		expect(await language()).toMatchObject({ html: "en" });

		await page.getByRole("button", { name: "Language: English" }).click();
		await choose("Nederlands", "nl");

		expect(await language()).toEqual({ html: "nl", cookie: "nl" });
		await page.getByText("Log in met je Fieldworks-account", { exact: false }).waitFor();
		expect(await page.getByRole("button", { name: "Taal: Nederlands" }).count()).toBe(1);
	});

	test("validation messages are translated", async () => {
		await app.submit(app.page.getByRole("button", { name: "Inloggen" }));
		expect(await app.issues()).toEqual(["Vul je e-mailadres in.", "Vul je wachtwoord in."]);
	});

	test("signing in leads to a Dutch app", async () => {
		const { page } = app;
		await page.getByLabel("E-mailadres").fill(users.admin);
		await page.getByLabel("Wachtwoord").fill(DEMO_PASSWORD);
		await page.getByRole("button", { name: "Inloggen" }).click();
		await page.waitForURL((url) => url.pathname === "/");
		await page.waitForLoadState("networkidle");

		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Opdrachten" }).waitFor();
		for (const name of ["Dashboard", "Opdrachten", "Planning", "Klanten", "Servicecontracten"]) {
			expect(await sidebar.getByRole("link", { name }).count(), name).toBe(1);
		}
		await page.getByRole("heading", { name: "Dashboard" }).waitFor();
		expect(await page.getByText("Open opdrachten", { exact: true }).count()).toBe(1);
		expect(await page.title()).toBe("Dashboard");
	});

	test("amounts, dates and statuses are formatted the Dutch way", async () => {
		const { page } = app;
		const revenue = page
			.locator('[data-slot="card"]', { hasText: "Omzet, laatste 30 dagen" })
			.locator('[data-slot="card-title"]');
		expect(await text(revenue)).toMatch(/^€ \d{1,3}(\.\d{3})*,\d{2}$/);

		const upcoming = page.locator('[data-slot="card"]', { hasText: "Komend werk" });
		await upcoming.getByRole("columnheader", { name: "Gepland" }).waitFor();
		const first = upcoming.getByRole("row").nth(1).getByRole("cell");
		expect(await text(first.last())).toMatch(dutchDate);
		expect(await text(first.nth(3))).toMatch(/^(Laag|Normaal|Hoog|Spoed)$/);
	});

	test("a server refusal is translated", async () => {
		const { page } = app;
		await page.locator('[data-sidebar="header"] button').first().click();
		const body = await app.expectingErrors(async () => {
			// Point South's entry at an organization the admin doesn't belong to.
			const entry = page.getByRole("menuitem", { name: organizations.south.name });
			await entry.evaluate((element) => {
				element.closest("form")!.querySelector<HTMLInputElement>('input[type="hidden"]')!.value =
					"org-elsewhere";
			});
			const [response] = await Promise.all([
				page.waitForResponse((r) => r.request().method() === "POST"),
				entry.click(),
			]);
			expect(response.status()).toBe(403);
			return response.text();
		});
		expect(body).toContain("Je bent geen lid van die organisatie");
	});

	test("the user menu switches back to English", async () => {
		const { page } = app;
		await app.go("/");
		await page.locator('[data-sidebar="footer"] button').first().click();
		await page.getByRole("menuitem", { name: /^Taal/ }).click();
		await choose("English", "en");

		expect(await language()).toEqual({ html: "en", cookie: "en" });
		await page.getByRole("heading", { name: "Dashboard" }).waitFor();
		expect(
			await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Orders" }).count(),
		).toBe(1);
	});
});
