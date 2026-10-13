/**
 * Checks that a tab open on one build notices, through the service worker, that another has been
 * deployed, and runs it from its next navigation. Run it against a production build, rebuild and
 * restart the server when it says so, then create the file it names:
 *
 *     node scripts/sw-deploy.ts http://localhost:4180
 *
 * With `idle` after the URL, it checks that a tab left alone for an hour takes the new version by
 * itself, without a navigation; with `fresh`, that a new tab runs the new version at once.
 */
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Page } from "playwright";

const origin = process.argv[2] ?? "http://localhost:4180";
const signal = join(tmpdir(), "sw-deploy-done");
rmSync(signal, { force: true });

/** Navigates client-side, through a link SvelteKit's router takes over. */
async function go(page: Page, path: string) {
	await page.evaluate((href) => {
		const link = Object.assign(document.createElement("a"), { href });
		document.body.append(link);
		link.click();
		link.remove();
	}, path);
	await page.waitForFunction((target) => location.pathname === target, path);
}

/** The notice a page loaded for a new version shows, if it does. */
const says = (page: Page) =>
	page
		.getByText("The app was updated")
		.waitFor({ timeout: 5_000 })
		.then(() => page.getByText("The app was updated").innerText())
		.catch(() => "nothing");

const browser = await chromium.launch();
const context = await browser.newContext({ locale: "en-GB" });
const page = await context.newPage();
// With `idle`, the tab is left alone after the deployment instead of navigating, on a clock the
// script moves on.
const idle = process.argv[3] === "idle";
// With `fresh`, a new tab opens the app after the deployment.
const fresh = process.argv[3] === "fresh";
if (idle) await page.clock.install();
/** The version the server runs; asked a few times, as the server may have only just restarted. */
const appVersion = () =>
	page.evaluate(async () => {
		for (let attempt = 1; ; attempt++) {
			try {
				return (await (await fetch("/_app/version.json")).json()).version as string;
			} catch (error) {
				if (attempt === 10) throw error;
				await new Promise((done) => setTimeout(done, 500));
			}
		}
	});

await page.goto(`${origin}/login`);
await page.fill('input[type="email"]', "admin@fieldworks.example");
await page.fill('input[type="password"]', "fieldworks-demo");
await page.press('input[type="password"]', "Enter");
await page.waitForURL(`${origin}/`);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await page.waitForTimeout(1_000);
await go(page, "/customers");
await page.waitForTimeout(1_500);
await go(page, "/engineers");
await page.waitForTimeout(1_500);
// Gone once the document is loaded afresh.
await page.evaluate(() => Object.assign(window, { __sameDocument: true }));
const before = await appVersion();
console.log(`the tab runs ${before}; now rebuild, restart the server, then: touch ${signal}`);

while (!existsSync(signal)) await new Promise((done) => setTimeout(done, 500));
const after = await appVersion();
console.log(`the server runs ${after}`);

if (fresh) {
	// A new tab: its page comes from the server (the worker keeps no pages), so it runs the new
	// version at once, whatever the worker had cached of the old one.
	const tab = await context.newPage();
	const files = { worker: 0, network: 0 };
	tab.on("response", (response) => {
		if (!response.url().includes("/_app/immutable/")) return;
		files[response.fromServiceWorker() ? "worker" : "network"]++;
	});
	const document = await (await tab.goto(`${origin}/customers`))!.text();
	await tab.waitForLoadState("networkidle");
	const runs = /version: ?"([^"]+)"/.exec(document)?.[1];
	console.log(
		`a new tab runs ${runs}; its build files: ${files.worker} from the worker, ${files.network} from the network`,
	);
	const worker = await tab.evaluate(async () => {
		const registration = await navigator.serviceWorker.getRegistration();
		return registration?.installing || registration?.waiting ? "installing" : "up to date";
	});
	await tab.waitForTimeout(3_000);
	const cached = await tab.evaluate(async () =>
		(await caches.keys()).filter((name) => name.startsWith("files-")),
	);
	console.log(
		`the new worker on that load: ${worker}; the build file caches after: ${cached.length}`,
	);
} else if (idle) {
	// Nobody touches the tab for an hour: SvelteKit's hourly check finds the new version, and the
	// tab, idle that long, reloads by itself.
	await page.clock.fastForward("01:00:30");
	await page.waitForFunction(() => !("__sameDocument" in window), null, { timeout: 15_000 });
	console.log(`the tab reloaded by itself, on ${await appVersion()}`);
	console.log(`and says so: ${await says(page)}`);
} else {
	// A page whose answers the worker has: it shows them, asks the new server again, and has the
	// tab read the answer of the new version; SvelteKit notices it by its version header.
	await go(page, "/customers");
	await page.waitForTimeout(2_500);
	await go(page, "/engineers");
	await page.waitForLoadState("load");
	const sameDocument = await page.evaluate(() => "__sameDocument" in window);
	console.log(`the next navigation loaded the page afresh: ${!sameDocument}`);
	console.log(`and says so: ${await says(page)}`);
}
await browser.close();
