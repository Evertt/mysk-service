/**
 * Tries to reproduce the sign-in hang and Svelte's `invariant_violation` "Batch has scheduled
 * effects" seen with the modules' skeletons loaded after the office layout mounts (see
 * "Skeletons" in AGENTS.md). Not part of the suite: it runs only with `REPRO_SKELETONS=1`.
 *
 * `REPRO_CPU_RATE` (default 6) slows the browser's CPU down that many times, `REPRO_ITERATIONS`
 * (default 50) is how many navigations it tries, and `REPRO_SETTLE_MS` (default 10 s, more for a
 * rate above 6) how long a page may take to settle before it counts as slow. It counts what goes
 * wrong per scenario, prints a table (and appends it to the file `REPRO_OUT` names, if any: Vitest
 * hides a passing test's console), and fails at the end if anything went wrong. "own skeleton"
 * counts the navigations to the schedule that showed its own skeleton, which is fine.
 */
import { appendFileSync } from "node:fs";

import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";

import { baseURL, organizations, useApp, users } from "./app.ts";

const rate = Number(process.env.REPRO_CPU_RATE ?? 6);
const iterations = Number(process.env.REPRO_ITERATIONS ?? 50);
const settleMs = Number(process.env.REPRO_SETTLE_MS ?? Math.round(10_000 * Math.max(1, rate / 6)));
/** How much longer a page that hasn't settled gets before it counts as hung, not slow. */
const hungMs = 30_000;

type Outcome =
	| "ok"
	| "slow"
	| "hung"
	| "invariant"
	| "other error"
	| "generic skeleton"
	| "own skeleton";
const outcomes: Outcome[] = [
	"ok",
	"slow",
	"hung",
	"invariant",
	"other error",
	"generic skeleton",
	"own skeleton",
];
/** What goes in the table without being a problem: the schedule showed its own skeleton. */
const fine = new Set<Outcome>(["ok", "own skeleton"]);

/** In this order, so the switch follows the admin's sign-in. */
const scenarioNames = [
	"a: sign in, click sidebar",
	"c: switch organization, click",
	"b: planner signs in, goto /settings",
] as const;
type Scenario = (typeof scenarioNames)[number];

/** Records which skeleton each navigation overlay shows: the schedule's own or a generic one. */
const recordSkeletons = () => {
	const seen: string[] = [];
	(window as unknown as { __skeletons: string[] }).__skeletons = seen;
	new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				const overlay = node.matches(".navigation-skeleton")
					? node
					: node.querySelector(".navigation-skeleton");
				if (!overlay) continue;
				seen.push(overlay.querySelector('[class*="grid-cols-[8rem"]') ? "schedule" : "generic");
			}
		}
	}).observe(document, { childList: true, subtree: true });
};

describe.skipIf(!process.env.REPRO_SKELETONS)("module skeletons, loaded lazily", () => {
	const app = useApp({ user: null });
	const errors: string[] = [];
	/** The distinct errors the page logged, for the summary. */
	const errorTexts = new Set<string>();

	const url = (path: string) => new URL(path, baseURL).href;
	const sidebarLink = (page: Page, name: string) =>
		page.locator('[data-sidebar="content"]').getByRole("link", { name, exact: true });
	const skeletonsSeen = (page: Page) =>
		page.evaluate(() => {
			const seen = (window as unknown as { __skeletons?: string[] }).__skeletons ?? [];
			return seen.splice(0);
		});

	/** Whether the page shows `path` hydrated, with its heading and no navigation overlay. */
	async function settles(page: Page, path: string, timeout: number) {
		try {
			await page.waitForURL((u) => u.pathname === path, { timeout, waitUntil: "commit" });
			await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout });
			await page.locator("h1").first().waitFor({ state: "visible", timeout });
			await page.locator(".navigation-skeleton").waitFor({ state: "detached", timeout });
			return true;
		} catch {
			return false;
		}
	}

	/** Waits for the page to show `path`, and says how that went. */
	async function outcome(page: Page, path: string): Promise<Outcome> {
		let result: Outcome = "ok";
		if (!(await settles(page, path, settleMs))) {
			result = (await settles(page, path, hungMs)) ? "slow" : "hung";
		}
		const logged = errors.splice(0);
		for (const text of logged) errorTexts.add(text.slice(0, 300));
		if (logged.some((e) => /invariant_violation|scheduled effects/i.test(e))) return "invariant";
		if (logged.length) return "other error";
		return result;
	}

	async function signIn(page: Page, email: string, redirectTo = "/") {
		await page.context().clearCookies();
		await page.goto(url(`/login?redirectTo=${encodeURIComponent(redirectTo)}`));
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(DEMO_PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL((u) => u.pathname !== "/login", {
			timeout: settleMs + hungMs,
			waitUntil: "commit",
		});
	}

	/** a: signs the admin in, and clicks Schedule (then Customers) as soon as the login is left. */
	async function signInAndClick(page: Page, round: number): Promise<Outcome[]> {
		await signIn(page, users.admin, "/orders");
		const [name, path] = round % 2 ? ["Customers", "/customers"] : ["Schedule", "/schedule"];
		await sidebarLink(page, name).click();
		const result = await outcome(page, path);
		return path === "/schedule" ? [result, ...(await skeletonCheck(page))] : [result];
	}

	/**
	 * c: switches organization through the sidebar and clicks right away: Schedule in North, and
	 * Customers in South, which hasn't the schedule.
	 */
	async function switchAndClick(page: Page): Promise<Outcome[]> {
		await page.goto(url("/"));
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		const header = await page.locator('[data-sidebar="header"]').innerText();
		const to = header.includes(organizations.north.name)
			? organizations.south
			: organizations.north;
		await page.locator('[data-sidebar="header"] button').first().click();
		await page.getByRole("menuitem", { name: to.name }).click();
		// Clicks as soon as the sidebar names the new organization, without waiting for the network.
		await page
			.locator('[data-sidebar="header"]', { hasText: to.name })
			.waitFor({ timeout: settleMs + hungMs });
		const [name, path] =
			to === organizations.north ? ["Schedule", "/schedule"] : ["Customers", "/customers"];
		await sidebarLink(page, name).click({ timeout: settleMs + hungMs });
		const result = await outcome(page, path);
		return path === "/schedule" ? [result, ...(await skeletonCheck(page))] : [result];
	}

	/** b: signs the planner in and opens /settings at once, like `tenancy.test.ts`. */
	async function plannerToSettings(page: Page): Promise<Outcome[]> {
		await signIn(page, users.planner);
		await page.goto(url("/settings"), { waitUntil: "commit" });
		return [await outcome(page, "/settings")];
	}

	/** A navigation to the schedule that showed the generic skeleton instead of its own. */
	async function skeletonCheck(page: Page): Promise<Outcome[]> {
		const seen = await skeletonsSeen(page).catch((): string[] => []);
		if (seen.includes("generic")) return ["generic skeleton"];
		return seen.includes("schedule") ? ["own skeleton"] : [];
	}

	const scenarios: Record<Scenario, (page: Page, round: number) => Promise<Outcome[]>> = {
		"a: sign in, click sidebar": signInAndClick,
		"c: switch organization, click": switchAndClick,
		"b: planner signs in, goto /settings": plannerToSettings,
	};

	test(
		`stays responsive (CPU ${rate}x, ${iterations} rounds)`,
		{ timeout: iterations * (settleMs + hungMs + 30_000) },
		async () => {
			const { page } = app;
			page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
			page.on("console", (message) => {
				if (message.type() === "error" && !/status of 404/.test(message.text())) {
					errors.push(`console: ${message.text()}`);
				}
			});
			await page.addInitScript(recordSkeletons);
			const cdp = await page.context().newCDPSession(page);
			await cdp.send("Emulation.setCPUThrottlingRate", { rate });

			const names = scenarioNames;
			const counts = Object.fromEntries(
				names.map((name) => [name, Object.fromEntries(outcomes.map((o) => [o, 0]))]),
			) as Record<Scenario, Record<Outcome, number>>;
			const samples: string[] = [];

			for (let round = 0; round < iterations; round++) {
				const name = names[round % names.length];
				let results: Outcome[];
				try {
					results = await scenarios[name](page, Math.floor(round / names.length));
				} catch (error) {
					// A step before the check (signing in, the switcher) that never finished.
					const logged = errors.splice(0);
					for (const text of logged) errorTexts.add(text.slice(0, 300));
					results = [
						logged.some((e) => /invariant_violation|scheduled effects/i.test(e))
							? "invariant"
							: "hung",
					];
					samples.push(`${name} #${round}: ${String(error).split("\n")[0]} ${logged.join(" | ")}`);
				}
				for (const result of results) counts[name][result]++;
				if (results.some((r) => !fine.has(r))) {
					samples.push(`${name} #${round}: ${results.join(", ")}`);
				}
			}

			const cell = (text: string | number, width: number) => String(text).padStart(width);
			const width = Math.max(...names.map((name) => name.length));
			const summary = [
				`Skeleton repro, CPU ${rate}x, ${iterations} rounds, settle ${settleMs} ms`,
				[cell("", width), ...outcomes.map((o) => cell(o, o.length))].join(" | "),
				...names.map((name) =>
					[name.padEnd(width), ...outcomes.map((o) => cell(counts[name][o], o.length))].join(" | "),
				),
				...(errorTexts.size ? ["Errors:", ...[...errorTexts].slice(0, 10)] : []),
				...samples.slice(0, 30),
			].join("\n");
			// Vitest shows a passing test's console only with `--silent=false`: `REPRO_OUT` keeps it.
			console.log(`\n${summary}`);
			if (process.env.REPRO_OUT) appendFileSync(process.env.REPRO_OUT, `${summary}\n\n`);

			const problems = names.flatMap((name) =>
				outcomes
					.filter((o) => !fine.has(o) && counts[name][o] > 0)
					.map((o) => `${name}: ${o} ${counts[name][o]}x`),
			);
			// The listeners of `useApp()` saw the same errors; they're counted above.
			errors.length = 0;
			expect(problems, summary).toEqual([]);
		},
	);
});
