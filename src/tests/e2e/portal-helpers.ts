import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";

import { type App, BROWSER_OPTIONS, baseURL, hydrated, quiet } from "./app.ts";

/**
 * A page in a browser context of its own, signed in as `email`, with the URLs of the remote
 * functions it called on the way. Close its context when done.
 */
export async function signedInPage(app: App, email: string) {
	const browser = app.page.context().browser()!;
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		...BROWSER_OPTIONS,
	});
	const page = await context.newPage();
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_app/remote")) requests.push(request.url());
	});
	await page.goto(`${baseURL}/login`);
	await hydrated(page);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(DEMO_PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL((url) => url.pathname !== "/login");
	await quiet(page);
	return { page, requests };
}
