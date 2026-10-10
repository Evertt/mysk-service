// Edits a contract over and over (each save shows a toast), with CPU throttling, and reports
// console errors with their stacks.
import { chromium } from "/Users/evert/Sites/svadcn-themed/.claude/worktrees/agent-af8306f6909af57e0/node_modules/playwright/index.mjs";
import {
	DEMO_PASSWORD,
	demoUsers,
} from "/Users/evert/Sites/svadcn-themed/.claude/worktrees/agent-af8306f6909af57e0/src/lib/server/db/demo.ts";

const base = process.argv[2] ?? "http://localhost:5871";
const number = process.argv[3];
const rounds = Number(process.argv[4] ?? 20);
const throttle = Number(process.argv[5] ?? 4);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
const errors = [];
page.on("console", async (msg) => {
	if (msg.type() !== "error") return;
	let stack = msg.text();
	try {
		stack = await msg.args()[0]?.evaluate((e) => (e instanceof Error ? e.stack : String(e)));
	} catch {}
	errors.push(stack);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.stack));
const cdp = await page.context().newCDPSession(page);
await page.goto(base + "/login");
await page.getByLabel("Email").fill(demoUsers[0].email);
await page.getByLabel("Password").fill(DEMO_PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => u.pathname !== "/login");
await page.waitForLoadState("networkidle");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });

await page.goto(`${base}/contracts/${number}`);
await page.waitForLoadState("networkidle");
const levels = ["basic", "standard", "premium"];
try {
	for (let i = 0; i < rounds; i++) {
		const before = errors.length;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		await page.getByLabel("Level").selectOption(levels[i % 3]);
		await page.getByRole("button", { name: "Save contract" }).click();
		await page.waitForURL((u) => u.pathname === `/contracts/${number}`);
		await page.waitForLoadState("networkidle");
		const delay = 2500 + Math.random() * 2500;
		await page.waitForTimeout(delay);
		console.log(`round ${i} delay ${Math.round(delay)} errors +${errors.length - before}`);
	}
} catch (e) {
	console.log("FAILED", e.message.split("\n")[0], page.url());
	await page.screenshot({ path: "fail.png" });
	console.log((await page.locator("body").innerText()).slice(0, 500));
}
await page.waitForTimeout(5000);
console.log("total errors", errors.length);
const counts = new Map();
for (const e of errors) counts.set(e, (counts.get(e) ?? 0) + 1);
for (const [e, n] of [...counts].slice(0, 15)) console.log(`--- x${n}\n${e}`);
await browser.close();
