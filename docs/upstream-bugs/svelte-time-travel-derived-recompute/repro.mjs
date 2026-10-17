// Times the dashboard's resize across the sidebar's breakpoint, against a preview build of this
// app (`NODE_ENV=production vp build`, then `vp preview --port 5196`, freshly seeded database).
//
//   node repro.mjs 760 768          signed in at 760 px, resized to 768 px
//   NAV=1 node repro.mjs 760 900    via a full load, then back from /orders (a preload fork pending)
//
// Prints the long tasks after the resize, and, with a build instrumented by `instrument.py`, how
// often Svelte computed a derived (`ed`), how often while another batch was pending (`edb`), and
// which batches were pending (`apply.json`).
import { writeFileSync } from "node:fs";

import { chromium } from "playwright";

const [from = "760", to = "768"] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:5196";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(from), height: 900 } });
const page = await context.newPage();
await page.goto(`${base}/login`);
await page.getByLabel("Email").fill("admin@fieldworks.example");
await page.getByLabel("Password").fill("fieldworks-demo");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((url) => url.pathname !== "/login");
if (process.env.NAV) {
	await page.goto(`${base}/`);
	await page.waitForSelector("[data-dashboard-cards] svg");
	await page.getByRole("link", { name: "All orders" }).click();
	await page.waitForURL((url) => url.pathname === "/orders");
	await page.waitForTimeout(1000);
	await page.goBack();
}
await page.waitForSelector("[data-dashboard-cards] svg");
await page.waitForTimeout(1500);

await page.evaluate(() => {
	globalThis.__long = [];
	globalThis.__ap = [];
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) globalThis.__long.push(entry.duration);
	}).observe({ type: "longtask" });
});
const before = await page.evaluate(() => globalThis.__c && { ...globalThis.__c });
const start = Date.now();
await page.setViewportSize({ width: Number(to), height: 900 });
await page.waitForTimeout(400);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r))));
await page.waitForTimeout(300);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r))));
const wall = Date.now() - start;
const long = await page.evaluate(() => globalThis.__long.map(Math.round));
const after = await page.evaluate(() => globalThis.__c && { ...globalThis.__c });
if (after) {
	console.log(Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])));
	writeFileSync("apply.json", JSON.stringify(await page.evaluate(() => globalThis.__ap), null, 1));
}
console.log(JSON.stringify({ from, to, wall, longTasks: long }));
await browser.close();
