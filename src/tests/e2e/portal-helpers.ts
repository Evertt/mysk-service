import type { Page } from "playwright";

import { type App, baseURL, homeOf, hydrated, newContext, quiet, signInContext } from "./app.ts";

/**
 * Opens the engineer portal's header menu (`header-menu.svelte`: the language, theme and mode,
 * "Report a problem", "View as" and signing out), answering it.
 */
export async function openFieldMenu(page: Page) {
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	const menu = page.getByRole("menu");
	await menu.waitFor();
	return menu;
}

/**
 * Signs out of a portal, back to the login page: of the engineer portal from its header menu, of
 * the customer portal with its header's button.
 */
export async function signOutOfPortal(page: Page) {
	// The phone frame's wrappers are there on any screen (`display: contents` on a phone's).
	if ((await page.locator("[data-phone-frame]").count()) > 0) {
		const menu = await openFieldMenu(page);
		await menu.getByRole("menuitem", { name: "Sign out" }).click();
	} else {
		await page.getByRole("button", { name: "Sign out" }).click();
	}
	await page.waitForURL((url) => url.pathname === "/login");
}

/**
 * A page in a browser context of its own, signed in as `email`, with the URLs of the remote
 * functions it called on the way. Close its context when done.
 *
 * Signed in without the form (`signInContext`), but on the way the login form takes: from the
 * login page to their home in the app, client-side, so the home's queries are remote function
 * calls (a page the server renders answers them itself).
 */
export async function signedInPage(app: App, email: string) {
	const browser = app.page.context().browser()!;
	const context = await newContext(browser, { viewport: { width: 1440, height: 1000 } });
	const page = await context.newPage();
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_app/remote")) requests.push(request.url());
	});
	const [home] = await Promise.all([
		homeOf(email),
		page.goto(`${baseURL}/login`).then(() => hydrated(page)),
	]);
	await signInContext(context, email);
	// A link the app's router follows, as it follows the form's redirect. The router starts
	// listening only after the page is hydrated (SvelteKit's `start()`): until it takes the click
	// (it prevents the browser's own navigation), the click is called off and tried again.
	const followed = await page.evaluate(async (href) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			const link = document.createElement("a");
			link.href = href;
			document.body.append(link);
			let routed = false;
			const check = (event: MouseEvent) => {
				routed = event.defaultPrevented;
				if (!routed) event.preventDefault();
			};
			window.addEventListener("click", check, { once: true });
			link.click();
			link.remove();
			if (routed) return true;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return false;
	}, home);
	if (!followed) throw new Error(`The app's router didn't follow a link to ${home}.`);
	await page.waitForURL((url) => url.pathname === home);
	await quiet(page);
	return { page, requests };
}
