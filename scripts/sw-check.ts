/**
 * Checks what the service worker experiment shows when the data changed: (1) changed by someone
 * else (here: in the database), the page shows the cached answer, then the new one, and settles;
 * (2) changed in the app, the page never shows the old answer.
 *
 *     node scripts/sw-check.ts http://localhost:4180
 */
import { createClient } from "@libsql/client";
import { chromium, type Page } from "playwright";

const origin = process.argv[2] ?? "http://localhost:4180";
const code = "CUST-0030";
const original = "Autobedrijf Vandenberghe";

const db = createClient({ url: "file:local.db" });
const rename = (name: string) =>
	db.execute({
		sql: "update customer set name = ? where code = ? and id = 30",
		args: [name, code],
	});

/** Navigates client-side, through a link SvelteKit's router takes over. */
async function go(page: Page, path: string) {
	await page.evaluate((href) => {
		const link = Object.assign(document.createElement("a"), { href });
		document.body.append(link);
		link.click();
		link.remove();
	}, path);
	await page.waitForFunction((target) => location.pathname === target, path, { polling: 5 });
}

const heading = (page: Page) => page.locator("h1").first().innerText();

const browser = await chromium.launch();
const context = await browser.newContext({ locale: "en-GB" });
const page = await context.newPage();
let t0 = Date.now();
const log = (text: string) =>
	process.env.VERBOSE && console.log(`   [${Date.now() - t0} ms] ${text}`);
page.on("console", (message) => log(`console: ${message.text()}`));
page.on("request", (request) =>
	log(`page asks ${request.method()} ${request.url().replace(origin, "")}`),
);
page.on("requestfinished", (request) => log(`page got ${request.url().replace(origin, "")}`));
await context.addInitScript(() => {
	navigator.serviceWorker?.addEventListener("message", (event) =>
		console.log("message", JSON.stringify(event.data)),
	);
});

let workerRequests: string[] = [];
context.on("request", (request) => {
	if (request.serviceWorker() && request.url().includes("/_app/remote/")) {
		workerRequests.push(new URL(request.url()).pathname.split("/").at(-1)!);
		log(`worker asks ${request.url().replace(origin, "")}`);
	}
});

await rename(original);
await page.goto(`${origin}/login`);
await page.fill('input[type="email"]', "admin@fieldworks.example");
await page.fill('input[type="password"]', "fieldworks-demo");
await page.press('input[type="password"]', "Enter");
await page.waitForURL(`${origin}/`);
await page.goto(`${origin}/?sw=on`);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await page.waitForTimeout(1_000);

console.log("1. Changed elsewhere");
await go(page, `/customers/${code}`);
await page.waitForTimeout(1_500);
await go(page, "/engineers");
await page.waitForTimeout(1_500);
await rename(`${original} (changed elsewhere)`);
workerRequests = [];
const started = (t0 = Date.now());
await go(page, `/customers/${code}`);
console.log(`   at commit, ${Date.now() - started} ms: ${await heading(page)}`);
await page.waitForFunction(
	(name) => document.querySelector("h1")?.textContent?.includes(name),
	"changed elsewhere",
);
console.log(`   then, ${Date.now() - started} ms: ${await heading(page)}`);
await page.waitForTimeout(5_000);
console.log(
	`   the worker asked the server ${workerRequests.length}x in 5 s: ${workerRequests.join(", ")}`,
);

console.log("2. Changed in the app");
await go(page, "/engineers");
await page.waitForTimeout(1_500);
await go(page, `/customers/${code}/edit`);
await page.getByLabel("Name", { exact: true }).fill(`${original} (changed in the app)`);
await page.getByRole("button", { name: /save/i }).click();
await page.waitForFunction((target) => location.pathname === target, `/customers/${code}`);
console.log(`   after saving: ${await heading(page)}`);
await go(page, "/engineers");
await page.waitForTimeout(1_500);
const seen = new Set<string>();
const watching = setInterval(
	() =>
		void heading(page).then(
			(text) => seen.add(text),
			() => {},
		),
	20,
);
await go(page, `/customers/${code}`);
await page.waitForTimeout(2_000);
clearInterval(watching);
console.log(`   headings shown on the way back: ${[...seen].join(" | ")}`);

await rename(original);
await browser.close();
