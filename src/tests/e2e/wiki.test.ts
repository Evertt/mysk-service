/**
 * The public wiki (`/wiki`, docs/plans/wiki.md): open to anyone, signed in or not, in the visitor's
 * theme, with the sidebar of the wiki's sections.
 */
import { describe, expect, test } from "vite-plus/test";

import { wikiNav } from "#wiki/pages.ts";

import { baseURL, users, useApp } from "./app.ts";

const first = "/wiki/start/what-fieldworks-is";

describe("signed out", () => {
	const app = useApp({ user: null });

	test("opens signed out", async () => {
		await app.go("/wiki");
		expect(app.path()).toBe(first);
		expect(await app.page.getByRole("heading", { level: 1 }).innerText()).toBe(
			"What Fieldworks is",
		);
	});

	test("keeps the visitor's theme", async () => {
		await app.page.context().addCookies(
			Object.entries({ theme: "harbor", mode: "dark" }).map(([name, value]) => ({
				name,
				value,
				url: baseURL,
			})),
		);
		await app.go(first);
		expect(app.path()).toBe(first);
		expect(
			await app.page.evaluate(() => ({
				theme: document.documentElement.dataset.theme,
				dark: document.documentElement.classList.contains("dark"),
			})),
		).toEqual({ theme: "harbor", dark: true });
	});

	test("404s an unknown page", async () => {
		const response = await app.expectingErrors(() => app.go("/wiki/nope"));
		expect(response?.status()).toBe(404);
		expect(app.path()).toBe("/wiki/nope");
		expect(await app.page.locator('[data-error-kind="http"]').count()).toBe(1);
	});

	test("lists every section with pages in the sidebar", async () => {
		await app.go(first);
		// The text content: the labels are shown in capitals by CSS.
		const groups = await app.page
			.locator('nav [data-sidebar="group-label"]')
			.evaluateAll((labels) => labels.map((label) => label.textContent));
		expect(groups).toEqual(wikiNav().map((group) => group.label));
	});
});

describe("signed in", () => {
	const app = useApp({ user: users.planner });

	test("opens signed in, without being sent to the shell", async () => {
		await app.go("/wiki");
		expect(app.path()).toBe(first);
	});
});
