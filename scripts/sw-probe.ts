/**
 * Shows what happens around navigations with the service worker: every request the page makes
 * (and whether the worker answered it), what the worker asks the server for, and when each
 * navigation commits. For finding why a page isn't answered from the cache.
 *
 *     node scripts/sw-probe.ts http://localhost:4180 /schedule /orders /schedule
 */
import { chromium, type Page } from "playwright";

const [origin = "http://localhost:4180", ...paths] = process.argv.slice(2);

const browser = await chromium.launch();
const context = await browser.newContext({
	locale: "en-GB",
	viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
let t0 = Date.now();
let quiet = false;
const log = (text: string) =>
	quiet || console.log(`  [${String(Date.now() - t0).padStart(5)} ms] ${text}`);
const short = (url: string) => decodeURIComponent(url.replace(origin, "")).slice(0, 110);

page.on("request", (request) => {
	if (request.url().includes("/_app/immutable/")) return;
	log(`page ${request.method()} ${short(request.url())}`);
});
page.on("requestfinished", (request) => {
	if (request.url().includes("/_app/immutable/")) return;
	void request.response().then((response) => {
		const by = response?.fromServiceWorker() ? "worker" : "network";
		log(`  got (${by}) ${short(request.url())}`);
	});
});
context.on("request", (request) => {
	if (request.serviceWorker())
		log(`worker asks server ${request.method()} ${short(request.url())}`);
});

async function navigate(page: Page, path: string) {
	const link = page.locator(`[data-sidebar="sidebar"] a[href="${path}"]`).first();
	t0 = Date.now();
	await link.click();
	await page.waitForFunction((target) => location.pathname === target, path, { polling: 5 });
	log(`committed ${path}`);
	await page.waitForTimeout(3_000);
}

await page.goto(`${origin}/login`);
await page.fill('input[type="email"]', "admin@fieldworks.example");
await page.fill('input[type="password"]', "fieldworks-demo");
await page.press('input[type="password"]', "Enter");
await page.waitForURL(`${origin}/`);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
// A first session: the worker learns the pages' queries by seeing them.
quiet = true;
for (const path of paths) await navigate(page, path);
quiet = false;
console.log("a later session: a fresh page load, so the shell warms the sidebar's pages:");
t0 = Date.now();
await page.goto(`${origin}/`);
await page.waitForTimeout(5_000);
for (const path of paths) {
	console.log(`\nclick ${path}:`);
	await navigate(page, path);
}

// Moving on and off a link: its page's queries are asked for once (`hoverFreshFor`).
const [first] = paths;
if (first) {
	console.log(`\nhovering on and off the link to ${first} five times, a second apart:`);
	t0 = Date.now();
	for (let i = 0; i < 5; i++) {
		await page.locator(`[data-sidebar="sidebar"] a[href="${first}"]`).first().hover();
		await page.waitForTimeout(500);
		await page.mouse.move(900, 600);
		await page.waitForTimeout(500);
	}
}
await browser.close();
