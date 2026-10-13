/**
 * Checks that the service worker keeps the build's files from when it's installed, and answers
 * them itself: the files cached after the first page, and where a reload's scripts came from.
 *
 *     node scripts/sw-files.ts http://localhost:4180
 */
import { chromium } from "playwright";

const origin = process.argv[2] ?? "http://localhost:4180";

const browser = await chromium.launch();
const page = await browser.newPage({ locale: "en-GB" });
await page.goto(`${origin}/login`);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const cached = await page.evaluate(async () => {
	const name = (await caches.keys()).find((key) => key.startsWith("files-"));
	return name ? (await (await caches.open(name)).keys()).length : 0;
});
console.log(`cached after the first page: ${cached} files`);

const sources = { worker: 0, network: 0 };
page.on("response", (response) => {
	if (!response.url().includes("/_app/immutable/")) return;
	sources[response.fromServiceWorker() ? "worker" : "network"]++;
});
await page.reload();
await page.waitForLoadState("networkidle");
console.log(
	`the reload's build files: ${sources.worker} from the worker, ${sources.network} from the network`,
);
await browser.close();
