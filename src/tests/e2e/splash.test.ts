/**
 * The splash screen of a full page load (`src/app.html`, ended by `src/routes/splash.ts`): in the
 * server's HTML, gone once the page is interactive, never on a client-side navigation or without
 * JavaScript, and visible for a while on a slow connection and computer.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { BROWSER_OPTIONS, baseURL, hydrated, quiet, useApp } from "./app.ts";

const app = useApp();

const splash = (page: Page) => page.locator("#splash");

/** The splash's opacity as shown, or `null` once it's gone. */
const splashOpacity = (page: Page) =>
	page.evaluate(() => {
		const element = document.getElementById("splash");
		return element ? Number(getComputedStyle(element).opacity) : null;
	});

describe("on a full page load", () => {
	test("the server's HTML has the splash, in the request's language; the stylesheets don't hold up the first paint, and are in before the page hydrates", async () => {
		const html = await (
			await fetch(new URL("/login", baseURL), { headers: { cookie: "PARAGLIDE_LOCALE=en" } })
		).text();
		expect(html).toMatch(/<div id="splash" role="status">/);
		expect(html).toContain("Loading Fieldworks…");
		expect(html).not.toContain("%splash.label%");

		const dutch = await fetch(new URL("/login", baseURL), {
			headers: { cookie: "PARAGLIDE_LOCALE=nl" },
		});
		expect(await dutch.text()).toContain("Fieldworks laden…");

		// No stylesheet blocks the paint: each is preloaded, and a plain one only without JavaScript.
		const head = html
			.slice(0, html.indexOf("</head>"))
			.replaceAll(/<noscript>.*?<\/noscript>/gs, "");
		expect(head).not.toMatch(/<link[^>]*rel="stylesheet"/);
		expect(head).toMatch(/<link[^>]*rel="preload" as="style" data-splash-style/);

		await app.page.goto(new URL("/login", baseURL).href);
		await hydrated(app.page);
		expect(
			await app.page.evaluate(() =>
				[...document.querySelectorAll<HTMLLinkElement>("link[data-splash-style]")].map(
					(link) => link.rel === "stylesheet" && !!link.sheet,
				),
			),
		).toEqual(expect.arrayContaining([true]));
		expect(
			await app.page.evaluate(() =>
				[...document.querySelectorAll<HTMLLinkElement>("link[data-splash-style]")].every(
					(link) => link.rel === "stylesheet" && !!link.sheet,
				),
			),
		).toBe(true);
	});

	test("it stops catching clicks once the page is interactive, then goes", async () => {
		await app.page.goto(new URL("/orders", baseURL).href);
		await hydrated(app.page);
		// Right away, while it may still be fading out: what's under the middle of the screen is
		// the page's.
		const covered = await app.page.evaluate(() => {
			const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
			return !!hit?.closest("#splash");
		});
		expect(covered).toBe(false);
		await splash(app.page).waitFor({ state: "detached" });
		expect(await app.page.locator("#app").getAttribute("aria-busy")).toBeNull();
	});

	test("a client-side navigation shows no splash", async () => {
		await app.go("/orders");
		await splash(app.page).waitFor({ state: "detached" });
		await app.page.evaluate(() => {
			(window as { sameDocument?: boolean }).sameDocument = true;
			new MutationObserver(() => {
				if (document.getElementById("splash")) {
					(window as { splashSeen?: boolean }).splashSeen = true;
				}
			}).observe(document.body, { childList: true, subtree: true });
		});
		await app.page.getByRole("link", { name: "Customers", exact: true }).first().click();
		await app.page.waitForURL((url) => url.pathname === "/customers");
		await quiet(app.page);
		expect(
			await app.page.evaluate(() => {
				const marks = window as { sameDocument?: boolean; splashSeen?: boolean };
				return { sameDocument: marks.sameDocument, splashSeen: marks.splashSeen ?? false };
			}),
		).toEqual({ sameDocument: true, splashSeen: false });
	});

	test("without JavaScript, it isn't shown", async () => {
		const context = await app.page
			.context()
			.browser()!
			.newContext({
				...BROWSER_OPTIONS,
				javaScriptEnabled: false,
				storageState: await app.page.context().storageState(),
			});
		try {
			const page = await context.newPage();
			for (const path of ["/orders", "/login"]) {
				await page.goto(new URL(path, baseURL).href);
				await expect.poll(() => splash(page).count()).toBe(1);
				expect(await splash(page).isVisible()).toBe(false);
			}
		} finally {
			await context.close();
		}
	});

	// Throttles the network and CPU for a while: run on demand, with `E2E_SLOW=1`.
	test.skipIf(!process.env.E2E_SLOW)(
		"on a slow connection and computer, it shows until the page is interactive",
		async () => {
			const page = await app.anotherTab();
			try {
				const cdp = await page.context().newCDPSession(page);
				await cdp.send("Network.enable");
				await cdp.send("Network.emulateNetworkConditions", {
					offline: false,
					latency: 150,
					downloadThroughput: (1_500 * 1024) / 8,
					uploadThroughput: (750 * 1024) / 8,
				});
				await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

				await page.goto(new URL("/orders", baseURL).href, { waitUntil: "commit" });
				// It covers the page from the first moment it's there, so the page never shows before it's
				// interactive…
				await page.waitForFunction(() => !!document.getElementById("splash"), undefined, {
					polling: 10,
					timeout: 15_000,
				});
				expect(
					await page.evaluate(() => {
						const element = document.getElementById("splash")!;
						const hydrated = "hydrated" in document.documentElement.dataset;
						return hydrated || getComputedStyle(element).opacity === "1";
					}),
				).toBe(true);
				// …and its logo and bar fade in after a moment (a fast load never sees them), while the
				// app loads…
				await page.waitForFunction(
					() => {
						const brand = document.querySelector("#splash .splash-brand");
						return (
							!!brand &&
							!("hydrated" in document.documentElement.dataset) &&
							getComputedStyle(brand).opacity === "1"
						);
					},
					undefined,
					{ polling: 50, timeout: 15_000 },
				);
				expect(await page.locator("#app").getAttribute("aria-busy")).toBe("true");

				// …and goes once it's interactive.
				await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 20_000 });
				await splash(page).waitFor({ state: "detached" });
				expect(await splashOpacity(page)).toBeNull();
				await cdp.detach();
			} finally {
				await page.context().close();
			}
		},
		45_000,
	);
});
