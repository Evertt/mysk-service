import { describe, expect, test } from "vite-plus/test";

import { baseURL, useApp } from "./app.ts";
import { shared } from "./orders-helpers.ts";

const app = useApp();

describe("in Dutch", () => {
	/** Sets the language as the language switchers do: Paraglide's cookie. */
	const speak = (locale: "en" | "nl") =>
		app.page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL }]);

	test("the orders list is in Dutch", async () => {
		const { page } = app;
		await speak("nl");
		await app.go("/orders");
		await page.getByRole("heading", { name: "Opdrachten" }).waitFor();
		expect(await page.title()).toBe("Opdrachten");
		expect(await page.getByRole("link", { name: "Nieuwe opdracht" }).count()).toBe(1);
		expect(await page.getByPlaceholder("Opdrachten zoeken…").count()).toBe(1);
		for (const name of ["Klant", "Apparaat", "Prioriteit", "Monteur"]) {
			expect(await page.getByRole("columnheader", { name }).count(), name).toBe(1);
		}
	});

	test("an order's page is in Dutch", async () => {
		const { page } = app;
		await app.go(`/orders/${shared}`);
		expect(await page.title()).toBe(`${shared} · Opdrachten`);
		const main = await page.locator("main").innerText();
		for (const text of ["Materialen en arbeid", "Arbeid", "Totaal", "Planning", "Aangemaakt"]) {
			expect(main, text).toContain(text);
		}
	});

	test("the order form's validation is in Dutch", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await app.submit(page.getByRole("button", { name: "Opdracht aanmaken" }));
		expect(await app.issues()).toEqual(
			expect.arrayContaining(["Kies een klant", "Omschrijf het werk"]),
		);
	});

	test("switching back to English", async () => {
		await speak("en");
		await app.go("/orders");
		await app.page.getByRole("heading", { name: "Orders" }).waitFor();
		expect(await app.page.title()).toBe("Orders");
	});
});
