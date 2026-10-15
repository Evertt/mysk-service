/**
 * Helpers for the end-to-end tests: a signed-in browser page on the app under test (see
 * `global-setup.ts`). The database (`db.ts`), the mail (`mail.ts`) and remote function requests
 * (`remote-functions.ts`) have their own files, which this one re-exports.
 */
import {
	type Browser,
	type BrowserContextOptions,
	chromium,
	type Locator,
	type Page,
	type Response,
} from "playwright";
import { afterAll, afterEach, beforeAll, expect } from "vite-plus/test";

import { TIME_ZONE_COOKIE } from "#lib/dates.ts";
import { DEMO_PASSWORD, demoOrganizations, demoUsers } from "#lib/server/db/demo.ts";

import { forgetTables } from "./db.ts";
import { baseURL } from "./lane.ts";
import { quiet, trackNetwork } from "./network.ts";

export { baseURL } from "./lane.ts";
export { cents, countIn, nextCode, rows, unbalancedStock, value } from "./db.ts";
export { linkInMail, sentMail } from "./mail.ts";
export { quiet } from "./network.ts";
export {
	isRemote,
	remoteErrorStatus,
	tamperWithCommand,
	tamperWithQuery,
} from "./remote-functions.ts";

// --- Browser ---------------------------------------------------------------------------------

/** Waits until a page is interactive (see the root layout), or settled if it errored. */
export const hydrated = (page: Page) =>
	Promise.race([page.locator("html[data-hydrated]").waitFor({ state: "attached" }), quiet(page)]);

/** Whether the page fits its screen's width: nothing on it makes it scroll sideways. */
export const fitsWidth = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Runs steps on a phone's screen (`mobileViewport`), then goes back to the screen it was on. */
export async function onPhone<T>(page: Page, steps: () => Promise<T>): Promise<T> {
	const before = page.viewportSize();
	await page.setViewportSize(mobileViewport);
	try {
		return await steps();
	} finally {
		if (before) await page.setViewportSize(before);
	}
}

/**
 * A list's page as a link to its first page (`/orders?page=1`): the list as it is by default,
 * rather than as the user left it, which a visit without parameters brings back (see
 * `table-memory.svelte.ts`).
 */
export const afresh = (path: string) => `${path}?page=1`;

/** The demo organizations: North (Fieldworks Noord) and South (Fieldworks Zuid). */
export const organizations = demoOrganizations;

/** The demo users' emails, to sign in with. */
export const users = {
	admin: demoUsers[0].email,
	planner: demoUsers[1].email,
	/** A field engineer in North, who only uses the engineer portal. */
	engineer: demoUsers[2].email,
};

/** The demo users' names, as the app shows them (e.g. in the activity log). */
export const userNames = {
	admin: demoUsers[0].name,
	planner: demoUsers[1].name,
	engineer: demoUsers[2].name,
};

/**
 * The browser's language in every test browser: English, so the app is in English (the tests read
 * its English texts) whatever the language of the machine running them.
 */
const BROWSER_LOCALE = "en-GB";

/**
 * The options of every test browser context: pass them to each new one,
 * `browser.newContext({ ...BROWSER_OPTIONS })`. Besides the language, without the app's service
 * worker (`src/service-worker/index.ts`): the tests check what the server answers, and
 * `page.route()`, which they tamper with and slow down requests with, doesn't see the requests a
 * worker answers. The worker has its own checks (`scripts/sw-check.ts`).
 */
export const BROWSER_OPTIONS = {
	locale: BROWSER_LOCALE,
	serviceWorkers: "block",
} as const satisfies BrowserContextOptions;

/** A phone's screen, e.g. for the engineer portal. */
export const mobileViewport = { width: 375, height: 812 };

export interface App {
	page: Page;
	/** Opens a path of the app and waits until it's hydrated. */
	go(path: string): Promise<Response | null>;
	/** The current path. */
	path(): string;
	/** Signs in at /login (from wherever the page is). */
	signIn(email: string): Promise<void>;
	/** Switches organization through the sidebar, which reloads the app at `/`. */
	switchOrganization(name: string): Promise<void>;
	/**
	 * Clicks something that submits a remote form and waits for the server's answer. Remote forms
	 * answer with HTTP 200 and the outcome in the body, e.g. `{"type":"error","error":{"status":404}}`.
	 */
	submit(target: Locator): Promise<string>;
	/** Runs steps that are expected to make the app log errors (e.g. a refused request). */
	expectingErrors<T>(steps: () => Promise<T>): Promise<T>;
	/** The validation messages shown in the form. */
	issues(): Promise<string[]>;
	/** The data table's "1,234 rows" count. */
	rowCount(): Promise<number>;
	/**
	 * Sorts the data table by a column alone, clicking its header (ascending, descending, then
	 * unsorted) until it's sorted that way.
	 */
	sortBy(column: string, direction: "ascending" | "descending"): Promise<void>;
	/**
	 * Waits until a server-side table shows the rows for its search, filters, sorting and page
	 * (it's `aria-busy` until they're in), e.g. after clicking a header or typing a search.
	 */
	tableSettled(): Promise<void>;
	/** Opens the data table's Filter menu and picks a filter by its title, showing its values. */
	openFilter(title: string): Promise<void>;
	/** The pill of an active filter in the data table's toolbar, by title; it names the values. */
	filterPill(title: string): Locator;
	/** Groups the data table's rows by a column (or `None`) through its View menu. */
	groupBy(column: string): Promise<void>;
	/** The data table's group rows on the page, in order. */
	groups(): Promise<TableGroup[]>;
	/** Waits for a toast with these texts (e.g. its title and description), and closes it. */
	toast(...texts: string[]): Promise<void>;
	/**
	 * Opens another tab in the same session, e.g. to do two things at once or to change the
	 * session elsewhere. Close its context when done.
	 */
	anotherTab(): Promise<Page>;
}

/** A group row of a data table that's grouped by a column. */
interface TableGroup {
	/** The group's value, e.g. `chiller`, `""` for none. */
	key: string;
	/** What it shows, e.g. `Chiller`. */
	label: string;
	/** How many rows it has, on every page. */
	count: number;
	/** It started on the previous page. */
	continued: boolean;
	/** It goes on on the next page. */
	continues: boolean;
	/** Its rows are hidden. */
	collapsed: boolean;
}

/**
 * Gives the tests in a file one browser page, signed in as `user` (the admin by default, who
 * starts in North; `null` for signed out), on a desktop screen unless `viewport` says
 * otherwise, in the time zone of the machine running them (the server's) unless `timeZone` says
 * otherwise: then the browser has told the server its zone already (the cookie the app sets, see
 * `src/routes/time-zone.ts`). After each test, checks that the app logged no errors or hydration
 * warnings.
 */
export function useApp({
	user = users.admin,
	viewport = { width: 1440, height: 1000 },
	timeZone,
	serviceWorkers = BROWSER_OPTIONS.serviceWorkers,
}: {
	user?: string | null;
	viewport?: { width: number; height: number };
	timeZone?: string;
	/**
	 * `"allow"` to run with the app's service worker (`src/service-worker/`), in this page and in
	 * `anotherTab()`: for what depends on it. Blocked by default (see `BROWSER_OPTIONS`).
	 */
	serviceWorkers?: "allow" | "block";
} = {}): App {
	let browser: Browser;
	let page: Page;
	const errors: string[] = [];
	let expecting = false;

	/** Until a (server-side) table shows the rows for its state: it's `aria-busy` until then. */
	const settled = async () => {
		await quiet(page);
		await page.locator('[data-slot="data-table"][aria-busy="true"]').waitFor({ state: "detached" });
	};
	const app: App = {
		get page() {
			return page;
		},
		async go(path) {
			const url = new URL(path, baseURL).href;
			// A visit, also to the page that's open: the browser takes a visit to the same URL for a
			// reload, which brings back what's typed into its forms (see `formSnapshot()`).
			if (page.url() === url) await page.goto("about:blank");
			const response = await page.goto(url);
			await hydrated(page);
			return response;
		},
		path: () => new URL(page.url()).pathname,
		async signIn(email) {
			if (app.path() !== "/login") await app.go("/login");
			await page.getByLabel("Email").fill(email);
			await page.getByLabel("Password").fill(DEMO_PASSWORD);
			await page.getByRole("button", { name: "Sign in" }).click();
			await page.waitForURL((url) => url.pathname !== "/login");
			await quiet(page);
		},
		async switchOrganization(name) {
			await page.locator('[data-sidebar="header"] button').first().click();
			await page.getByRole("menuitem", { name }).click();
			await page.waitForURL((url) => url.pathname === "/");
			await quiet(page);
		},
		async submit(target) {
			const button = await target.elementHandle();
			const [response] = await Promise.all([
				page.waitForResponse(
					(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
				),
				target.click(),
			]);
			const body = await response.text();
			// The page applies the answer after it arrives: it shows the issues (until then, those of
			// the previous submission), refreshes or navigates. The form is `pending` until it's done,
			// which disables its submit button (`SubmitButton`), so that's what's waited for. A wait for
			// the network to idle wouldn't do: once a page has idled, Playwright doesn't wait again.
			// Checked every 100 ms rather than every frame (the default), as a page that draws no frames
			// for a while (it happened in full runs) would hold the wait up.
			await page.waitForFunction(
				(element) => !element?.isConnected || !(element as HTMLButtonElement).disabled,
				button,
				{ polling: 100 },
			);
			await button?.dispose();
			await quiet(page);
			return body;
		},
		async expectingErrors(steps) {
			expecting = true;
			try {
				const result = await steps();
				// Errors from loading the outcome (e.g. an error page) still count as expected.
				await quiet(page);
				return result;
			} finally {
				expecting = false;
			}
		},
		issues: () => page.locator('[data-slot="field-error"]').allInnerTexts(),
		async rowCount() {
			const text = await page.getByText(/^[\d,]+ rows?$/).innerText();
			return Number(text.replace(/\D/g, ""));
		},
		async sortBy(column, direction) {
			const header = page.locator("thead").getByRole("button", { name: column });
			// Its text ends in how it's sorted, and its place in the sort if others are too.
			const state = async () => (await header.textContent())?.replace(/\s+/g, " ").trim();
			for (let clicks = 0; clicks < 3; clicks++) {
				const before = await state();
				if (before?.endsWith(`sorted ${direction}`)) return settled();
				await header.click();
				await expect.poll(state).not.toBe(before);
			}
			expect(await state()).toMatch(new RegExp(`sorted ${direction}$`));
			await settled();
		},
		tableSettled: () => settled(),
		async openFilter(title) {
			await page.getByRole("button", { name: "Filter", exact: true }).click();
			// By the filter's title exactly: "Unit" isn't "Unit price". (What's chosen follows it.)
			await page
				.getByRole("option")
				.filter({ has: page.getByText(title, { exact: true }) })
				.click();
		},
		filterPill: (title) => page.locator('[data-slot="filter-pill"]', { hasText: title }),
		async groupBy(column) {
			await page.getByRole("button", { name: "View", exact: true }).click();
			await page.getByRole("menuitem", { name: "Group by" }).click();
			await page.getByRole("menuitemradio", { name: column, exact: true }).click();
			await page.keyboard.press("Escape");
			await page.keyboard.press("Escape");
			await settled();
		},
		groups: () =>
			page.locator("tbody tr[data-group]").evaluateAll((trs: HTMLElement[]) =>
				trs.map((tr) => {
					const notes = [...tr.querySelectorAll("[data-group-note]")].map((note) =>
						note.textContent!.trim(),
					);
					const toggle = tr.querySelector("[data-group-toggle]")!;
					return {
						key: tr.dataset.group!,
						label: document.getElementById(toggle.getAttribute("aria-labelledby")!)!.innerText,
						count: Number(tr.querySelector("[data-group-count]")!.textContent!.replace(/\D/g, "")),
						continued: notes.includes("continued from the previous page"),
						continues: notes.includes("continues on the next page"),
						collapsed: toggle.getAttribute("aria-expanded") === "false",
					};
				}),
			),
		async toast(...texts) {
			const found = texts
				.reduce(
					(toasts, text) => toasts.filter({ hasText: text }),
					page.locator("[data-sonner-toast]"),
				)
				.first();
			await found.waitFor();
			// Closed once seen: it covers the bottom right of the page (a row's buttons, a form's Save)
			// until it times out, and for good while the pointer rests on it, e.g. where it was left by
			// the click that brought the toast up. Clicked without the pointer, so as not to rest on it.
			const toast = await found.elementHandle();
			await toast?.$eval("[data-close-button]", (button: HTMLElement) => button.click());
			await page.waitForFunction((element) => !element?.isConnected, toast, { polling: 100 });
			await toast?.dispose();
		},
		async anotherTab() {
			// The page has a context of its own, so a new context with its cookies.
			const context = await browser.newContext({
				...BROWSER_OPTIONS,
				serviceWorkers,
				storageState: await page.context().storageState(),
			});
			trackNetwork(context);
			return context.newPage();
		},
	};

	// A worker whose run was interrupted (its Vitest process gone, so its IPC channel closed) would
	// carry on with its test until that fails or times out, against a server that's gone, and hold
	// up the shell meanwhile. Vitest stubs `process.exit` in tests, so this closes the browser
	// (which runs in a process group of its own) and kills the worker. It stays registered until
	// the worker ends, through the `afterAll` hooks (a test file runs in a process of its own).
	const exitOrphaned = async () => {
		await Promise.race([browser?.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
		process.kill(process.pid, "SIGKILL");
	};

	beforeAll(async () => {
		process.once("disconnect", exitOrphaned);
		browser = await chromium.launch();
		page = await browser.newPage({
			...BROWSER_OPTIONS,
			serviceWorkers,
			viewport,
			timezoneId: timeZone,
		});
		trackNetwork(page.context());
		if (timeZone) {
			await page
				.context()
				.addCookies([
					{ name: TIME_ZONE_COOKIE, value: encodeURIComponent(timeZone), url: baseURL },
				]);
		}
		page.on("pageerror", (error) => expecting || errors.push(`pageerror: ${error.message}`));
		page.on("console", (message) => {
			const text = message.text();
			// A page that is a 404 on purpose logs the failed document request.
			if (/status of 404/.test(text)) return;
			if (message.type() === "error" && !expecting) errors.push(`error: ${text}`);
			else if (/hydrat/i.test(text)) errors.push(`${message.type()}: ${text}`);
		});
		await forgetTables();
		if (user) await app.signIn(user);
	});

	afterEach(async () => {
		// The toasts a test leaves would cover the bottom right of the page for the next (see `toast`).
		await page
			?.locator("[data-sonner-toast] [data-close-button]")
			.evaluateAll((buttons: HTMLElement[]) => buttons.forEach((button) => button.click()));
		const logged = errors.splice(0);
		expect(logged, "console errors and hydration warnings").toEqual([]);
	});

	afterAll(async () => {
		await browser?.close();
	});

	return app;
}
