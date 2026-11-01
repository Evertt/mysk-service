/**
 * The public wiki (`/wiki`, docs/plans/wiki.md): open to anyone, signed in or not, in the visitor's
 * theme and language (docs/plans/wiki-dutch.md), with the sidebar of the wiki's sections.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { m } from "#lib/paraglide/messages.js";
import { pageHref, wikiNav, wikiPages } from "#wiki/pages.ts";

import { baseURL, fitsWidth, onPhone, users, useApp } from "./app.ts";

const first = "/wiki/start/what-fieldworks-is";

/** A page without its Dutch twin yet, if there's one left. */
const untranslated = wikiPages.find((page) => !page.text.nl);

/** `run` with the app in Dutch, as for most visitors (Paraglide's cookie, and the browser's language). */
async function inDutch(page: Page, run: () => Promise<void>) {
	await page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "nl", url: baseURL }]);
	await page.setExtraHTTPHeaders({ "accept-language": "nl-NL,nl;q=0.9" });
	try {
		await run();
	} finally {
		await page.setExtraHTTPHeaders({});
		await page.context().clearCookies({ name: "PARAGLIDE_LOCALE" });
	}
}

/** The language `selector`'s element is read in: its nearest `lang`. */
const langOf = (page: Page, selector: string) =>
	page.locator(selector).evaluate((element) => element.closest("[lang]")?.getAttribute("lang"));

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
		// Within the wiki's shell, with the way back to the wiki, not to the dashboard.
		expect(await app.page.locator("nav[aria-label=Wiki]").count()).toBe(1);
		expect(
			await app.page.getByRole("link", { name: "Back to the wiki" }).getAttribute("href"),
		).toBe("/wiki");
	});

	test("search finds a page", async () => {
		const { page } = app;
		await app.go(first);
		await page.getByRole("button", { name: "Search the wiki" }).click();
		await page
			.getByRole("dialog")
			.getByRole("combobox", { name: "Search the wiki" })
			.fill("lifecycle");
		await page.getByRole("dialog").getByRole("option", { name: "Order lifecycle" }).first().click();
		await page.waitForURL((url) => url.pathname === "/wiki/orders/lifecycle");
		await page.getByRole("dialog").waitFor({ state: "detached" });
		await expect.poll(() => page.locator("main h1").innerText()).toBe("Order lifecycle");
	});

	test("a search result for a heading opens the page at the heading", async () => {
		const { page } = app;
		await app.go(first);
		await page.getByRole("button", { name: "Search the wiki" }).click();
		// Typed with a straight quote; the heading's is curled.
		await page
			.getByRole("dialog")
			.getByRole("combobox", { name: "Search the wiki" })
			.fill("isn't work");
		await page
			.getByRole("dialog")
			.getByRole("option", { name: /Until it’s decided, it isn’t work/ })
			.click();
		await page.waitForURL((url) => url.pathname === "/wiki/orders/awaiting-acceptance");
		expect(new URL(page.url()).hash).toBe("#until-its-decided-it-isnt-work");
		expect(await page.locator("main h2#until-its-decided-it-isnt-work").innerText()).toBe(
			"Until it’s decided, it isn’t work",
		);
	});

	test("a widget responds: the lifecycle lists a status's moves once it's chosen", async () => {
		const { page } = app;
		await app.go("/wiki/orders/lifecycle");
		const move = page.getByTestId("leaves-plan-scheduled");
		expect(await move.count()).toBe(0);
		await page.getByRole("button", { name: "Quote", exact: true }).click();
		await move.waitFor();
		expect(await page.getByRole("list", { name: "Leaves by" }).innerText()).toContain("Scheduled");
	});

	test("reads in English for an English visitor, with no note", async () => {
		const { page } = app;
		await app.go(first);
		expect(await langOf(page, "main article")).toBe("en");
		expect(await page.locator("main h1").innerText()).toBe("What Fieldworks is");
		expect(await page.getByTestId("wiki-untranslated").count()).toBe(0);
	});

	test("a Dutch visitor reads the page's Dutch twin, and the sidebar in Dutch", async () => {
		const { page } = app;
		await inDutch(page, async () => {
			await app.go(first);
			expect(await page.evaluate(() => document.documentElement.lang)).toBe("nl");
			expect(await page.locator("main h1").innerText()).toBe("Wat Fieldworks is");
			expect(await page.locator("main article").innerText()).toContain(
				"Drie soorten mensen gebruiken het",
			);
			expect(await langOf(page, "main article")).toBe("nl");
			expect(await page.getByTestId("wiki-untranslated").count()).toBe(0);
			const nav = page.locator("nav[aria-label=Wiki]");
			expect(await langOf(page, "nav[aria-label=Wiki]")).toBe("nl");
			expect(await nav.getByRole("link", { name: "Wat Fieldworks is" }).count()).toBe(1);
			expect(await nav.getByRole("link", { name: "What Fieldworks is" }).count()).toBe(0);
		});
	});

	test("a Dutch visitor's search finds the Dutch headings, by their Dutch ids", async () => {
		const { page } = app;
		await inDutch(page, async () => {
			await app.go(first);
			await page.getByRole("button", { name: "Zoek in de wiki" }).click();
			await page
				.getByRole("dialog")
				.getByRole("combobox", { name: "Zoek in de wiki" })
				.fill("wie ermee werken");
			await page
				.getByRole("dialog")
				.getByRole("option", { name: /Wie ermee werken/ })
				.click();
			await page.waitForURL((url) => url.hash === "#wie-ermee-werken");
			expect(await page.locator("main h2#wie-ermee-werken").innerText()).toBe("Wie ermee werken");
		});
	});

	test("a Dutch visitor sees no English chrome: the header, the sidebar's sections and the search", async () => {
		const { page } = app;
		await inDutch(page, async () => {
			await app.go(first);
			const open = page.getByRole("link", { name: "Open de app" });
			expect(await open.getAttribute("href")).toBe("/");
			expect(await page.getByRole("link", { name: "Open the app" }).count()).toBe(0);
			expect(await page.getByRole("button", { name: "Search the wiki" }).count()).toBe(0);
			expect(await page.locator("header").innerText()).toContain("Zoek in de wiki…");

			const groups = await page
				.locator('nav [data-sidebar="group-label"]')
				.evaluateAll((labels) => labels.map((label) => label.textContent));
			expect(groups[0]).toBe("Aan de slag");
			expect(groups).toContain("Opdrachten");
			expect(groups).not.toContain("Start");
			expect(groups).not.toContain("Orders");

			// The search's dialog, with no match.
			await page.getByRole("button", { name: "Zoek in de wiki" }).click();
			await page
				.getByRole("dialog")
				.getByRole("combobox", { name: "Zoek in de wiki" })
				.fill("zzzzzzzz");
			expect(await page.getByRole("dialog").innerText()).toContain(
				"Geen pagina gevonden voor “zzzzzzzz”.",
			);
		});
	});

	test("a Dutch visitor's 404 is in Dutch, with the way back to the wiki", async () => {
		const { page } = app;
		await inDutch(page, async () => {
			await app.expectingErrors(() => app.go("/wiki/nope"));
			expect(await page.title()).toBe("Pagina niet gevonden · Fieldworks-wiki");
			expect(
				await page.getByRole("link", { name: "Terug naar de wiki" }).getAttribute("href"),
			).toBe("/wiki");
		});
	});

	test("a Dutch visitor's widgets and parts are in Dutch: how it works, the lifecycle", async () => {
		const { page } = app;
		await inDutch(page, async () => {
			await app.go("/wiki/orders/lifecycle");
			// The widget follows the app's language, like the page around it. The app's word for a quote, then the moves out of it in Dutch.
			await page.getByRole("button", { name: "Nieuw", exact: true }).click();
			const move = page.getByTestId("leaves-plan-scheduled");
			await move.waitFor();
			expect(await move.innerText()).toBe("plan naar Ingepland, door een planner");
			expect(await page.getByRole("list", { name: "Uitgaande stappen" }).count()).toBe(1);
			expect(await page.locator("main figure").first().innerText()).not.toContain("Leaves by");
		});
	});

	test.runIf(untranslated)(
		"a Dutch visitor on a page without its twin reads it in English, marked so, with a note",
		async () => {
			const { page } = app;
			await inDutch(page, async () => {
				await app.go(pageHref(untranslated!.slug));
				expect(await page.locator("main h1").innerText()).toBe(untranslated!.text.en.title);
				expect(await langOf(page, "main article")).toBe("en");
				const note = page.getByTestId("wiki-untranslated");
				expect(await note.innerText()).toBe(m.wiki_not_translated({}, { locale: "nl" }));
				expect(await langOf(page, '[data-testid="wiki-untranslated"]')).toBe("nl");
				// Its sidebar entry is English too, the page's own title.
				expect(
					await page
						.locator("nav[aria-label=Wiki]")
						.getByRole("link", { name: untranslated!.text.en.title, exact: true })
						.count(),
				).toBe(1);
			});
		},
	);

	test("has the way into the app, which sends a visitor who isn't signed in to log in", async () => {
		const { page } = app;
		await app.go(first);
		const open = page.getByRole("link", { name: "Open the app" });
		expect(await open.getAttribute("href")).toBe("/");
		await open.click();
		await page.waitForURL((url) => url.pathname === "/login");
	});

	test("phone width shows the sidebar as a sheet", async () => {
		const { page } = app;
		await app.go(first);
		await onPhone(page, async () => {
			const nav = page.locator('[data-mobile="true"] nav[aria-label=Wiki]');
			expect(await nav.count()).toBe(0);
			await page.locator('[data-sidebar="trigger"]').click();
			await nav.waitFor();
			await nav.getByRole("link", { name: "Order lifecycle" }).click();
			await page.waitForURL((url) => url.pathname === "/wiki/orders/lifecycle");
			expect(await fitsWidth(page)).toBe(true);
		});
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

describe("trying the demo (the lanes' servers have DEMO_SIGN_IN)", () => {
	const app = useApp({ user: null });

	test("a Try it button signs in as its role, in one click, and is gone once in the demo", async () => {
		const { page } = app;
		await app.go("/wiki/start/try-the-demo");
		expect(await page.getByText("One-click demo sign-in is switched off").count()).toBe(0);
		await page.getByRole("button", { name: "Try it as the planner" }).click();
		await page.waitForURL((url) => url.pathname === "/");
		await page.locator("[data-hydrated]").waitFor({ state: "attached" });

		await app.go("/wiki/start/try-the-demo");
		expect(await page.locator("main h1").innerText()).toBe("Try the demo");
		expect(await page.getByRole("button", { name: /^Try it as/ }).count()).toBe(0);
	});
});

describe("signed in", () => {
	// The office shell owns every page but the customer portal's, so a planner stays on the wiki
	// either way; the guard sends an engineer and a customer's contact home from any page that isn't
	// their shell's, unless it's public (`isPublic`, `hooks.server.ts`).
	describe("as the planner", () => {
		const app = useApp({ user: users.planner });

		test("opens signed in, without being sent to the shell", async () => {
			await app.go("/wiki");
			expect(app.path()).toBe(first);
		});
	});

	describe("as a field engineer", () => {
		const app = useApp({ user: users.engineer });

		test("stays on the wiki, not sent to the engineer portal", async () => {
			await app.go("/wiki");
			expect(app.path()).toBe(first);
		});
	});

	describe("as a customer's contact", () => {
		const app = useApp({ user: users.northCustomer });

		test("stays on the wiki, not sent to the customer portal", async () => {
			await app.go("/wiki");
			expect(app.path()).toBe(first);
		});
	});
});
