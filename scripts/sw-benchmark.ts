/**
 * Times navigations between the office's pages with the service worker experiment off and on
 * (`src/service-worker/index.ts`): from the click on a sidebar link until SvelteKit commits the new
 * page's URL, which it does once the page's queries have answered.
 *
 * Run it against a production build with a slow server, e.g. the `sw-preview` configuration in
 * `.claude/launch.json` (`DEV_REMOTE_DELAY_MS=600 … vp preview --port 4180`):
 *
 *     node scripts/sw-benchmark.ts http://localhost:4180
 */
import { chromium, type Page } from "playwright";

const origin = process.argv[2] ?? "http://localhost:4180";
const pages = ["/customers", "/equipment", "/engineers", "/orders", "/"];

async function signIn(page: Page) {
	await page.goto(`${origin}/login`);
	await page.fill('input[type="email"]', "admin@fieldworks.example");
	await page.fill('input[type="password"]', "fieldworks-demo");
	await page.press('input[type="password"]', "Enter");
	await page.waitForURL(`${origin}/`);
}

/** Clicks the sidebar's link to `path` and answers how long until the URL changed to it. */
async function navigate(page: Page, path: string, { hover = 0 } = {}) {
	const link = page.locator(`[data-sidebar="sidebar"] a[href="${path}"]`).first();
	if (hover) {
		await link.hover();
		await page.waitForTimeout(hover);
	}
	const started = await page.evaluate(() => performance.now());
	await link.click();
	await page.waitForFunction((target) => location.pathname === target, path, {
		polling: 5,
		timeout: 30_000,
	});
	const committed = await page.evaluate(
		(target) =>
			(window as unknown as { __commits: { path: string; at: number }[] }).__commits.findLast(
				(commit) => commit.path === target,
			)?.at ?? performance.now(),
		path,
	);
	// Let the page settle (and the worker's revalidations land) before the next click.
	await page.waitForTimeout(2_500);
	return Math.round(committed - started);
}

async function run(mode: "off" | "on") {
	const browser = await chromium.launch();
	const context = await browser.newContext({
		locale: "en-GB",
		viewport: { width: 1400, height: 900 },
	});
	// When SvelteKit commits a navigation: its history entry for the new URL.
	await context.addInitScript(() => {
		const commits: { path: string; at: number }[] = [];
		Object.assign(window, { __commits: commits });
		for (const method of ["pushState", "replaceState"] as const) {
			const original = history[method].bind(history);
			history[method] = (data, unused, url) => {
				if (url)
					commits.push({ path: new URL(url, location.href).pathname, at: performance.now() });
				original(data, unused, url);
			};
		}
	});
	const page = await context.newPage();
	await signIn(page);
	await page.goto(`${origin}/?sw=${mode}`);
	if (mode === "on") {
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
		// The worker learns the pages' queries from the tab's navigations, and needs its scope.
		await page.waitForTimeout(1_000);
	}
	await page.goto(`${origin}/`);
	await page.waitForTimeout(2_000);

	const rounds: Record<string, number[]> = {};
	const round = async (name: string, options?: { hover?: number }) => {
		rounds[name] = [];
		for (const path of pages) rounds[name].push(await navigate(page, path, options));
	};
	await round("first visit");
	await round("second visit");
	await round("hover 300ms, then click", { hover: 300 });
	await browser.close();
	return rounds;
}

for (const mode of ["off", "on"] as const) {
	const rounds = await run(mode);
	console.log(`\nworker ${mode}`);
	console.log(`  ${"".padEnd(26)}${pages.map((path) => path.padStart(12)).join("")}     median`);
	for (const [name, times] of Object.entries(rounds)) {
		const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
		console.log(
			`  ${name.padEnd(26)}${times.map((ms) => `${ms} ms`.padStart(12)).join("")}${`${median} ms`.padStart(11)}`,
		);
	}
}
