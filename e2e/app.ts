/**
 * Helpers for the end-to-end tests: a signed-in browser page on the app under test (see
 * `global-setup.ts`), and read access to its database to check what the app stored.
 */
import { existsSync, readFileSync } from "node:fs";

import { createClient, type InValue } from "@libsql/client";
import { type Browser, chromium, type Locator, type Page, type Response } from "playwright";
import { afterAll, afterEach, beforeAll, expect, inject } from "vite-plus/test";

import { DEMO_PASSWORD, demoOrganizations, demoUsers } from "../src/lib/server/db/demo.ts";

/**
 * This worker's app and database (see `global-setup.ts`): files on other workers run at the same
 * time against their own.
 */
const lanes = inject("lanes");
const lane = lanes[(Number(process.env.VITEST_POOL_ID ?? 1) - 1) % lanes.length];

export const baseURL = lane.baseURL;

// --- Database --------------------------------------------------------------------------------

// The busy timeout: the app may be writing.
const client = createClient({ url: lane.databaseURL, timeout: 5000 });

/**
 * Runs a query against the app's database and returns its rows. Only for reading: tests change
 * data through the app, like a user would.
 */
export async function rows<T = Record<string, unknown>>(sql: string, args: InValue[] = []) {
	const result = await client.execute({ sql, args });
	return result.rows as unknown as T[];
}

/** The first column of the first row, e.g. of a `select count(*)`. */
export async function value<T = unknown>(sql: string, args: InValue[] = []) {
	const [row] = (await client.execute({ sql, args })).rows;
	return row?.[0] as T;
}

/** The number of rows in an organization's table. */
export async function countIn(table: string, organizationId: string) {
	return Number(
		await value(`select count(*) from "${table}" where organization_id = ?`, [organizationId]),
	);
}

/**
 * An organization's materials whose stock isn't the sum of their stock movements (to two
 * decimals), which should be none.
 */
export function unbalancedStock(organizationId: string) {
	return rows<{ sku: string; stock: number; movements: number }>(
		`select sku, stock, movements from (
			select m.sku, m.stock, round(coalesce(sum(s.quantity), 0), 2) as movements
			from material m left join stock_movement s on s.material_id = m.id
			where m.organization_id = ? group by m.id
		) where round(stock, 2) <> movements`,
		[organizationId],
	);
}

/** The next code in a sequence like `CUS-00061`: the highest number in use, plus one. */
export async function nextCode(table: string, column: string, organizationId: string) {
	const last = String(
		await value(
			`select "${column}" from "${table}" where organization_id = ?
			 order by cast(substr("${column}", length(rtrim("${column}", '0123456789')) + 1) as integer) desc
			 limit 1`,
			[organizationId],
		),
	);
	const [, prefix, digits] = /^(.*?)(\d+)$/.exec(last)!;
	return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
}

// --- Amounts ---------------------------------------------------------------------------------

/** An amount as shown, e.g. `-€1,234.50`, in cents. */
export const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);

// --- Mail ------------------------------------------------------------------------------------

export interface SentMail {
	from: string;
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** The mail the app sent to `to` (instead of sending it, see `MAIL_OUTBOX`), oldest first. */
export function sentMail(to: string): SentMail[] {
	if (!existsSync(lane.outbox)) return [];
	return readFileSync(lane.outbox, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as SentMail)
		.filter((mail) => mail.to === to);
}

/** The first link to the app in the latest mail to `to`, e.g. an invitation's. */
export function linkInMail(to: string) {
	const mail = sentMail(to).at(-1);
	const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
	if (!link) throw new Error(`No mail with a link was sent to ${to}`);
	return link;
}

// --- Browser ---------------------------------------------------------------------------------

/** Whether a request (its URL) calls the remote function `name`, e.g. `getOrders`. */
export const isRemote = (url: string, name: string) =>
	url.includes("/_app/remote/") && new URL(url).pathname.endsWith(`/${name}`);

/** Waits until a page is interactive (see the root layout), or settled if it errored. */
export const hydrated = (page: Page) =>
	Promise.race([
		page.locator("html[data-hydrated]").waitFor({ state: "attached" }),
		page.waitForLoadState("networkidle"),
	]);

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
 * its English texts) whatever the language of the machine running them. Pass it to every new
 * browser context: `browser.newContext({ locale: BROWSER_LOCALE })`.
 */
export const BROWSER_LOCALE = "en-GB";

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
	/** Groups the data table's rows by a column (or `None`) through its View menu. */
	groupBy(column: string): Promise<void>;
	/** The data table's group rows on the page, in order. */
	groups(): Promise<TableGroup[]>;
	/** Waits for a toast with this text. */
	toast(text: string): Promise<void>;
	/**
	 * Opens another tab in the same session, e.g. to do two things at once or to change the
	 * session elsewhere. Close its context when done.
	 */
	anotherTab(): Promise<Page>;
}

/** A group row of a data table that's grouped by a column. */
export interface TableGroup {
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
 * otherwise. After each test, checks that the app logged no errors or hydration warnings.
 */
export function useApp({
	user = users.admin,
	viewport = { width: 1440, height: 1000 },
}: { user?: string | null; viewport?: { width: number; height: number } } = {}): App {
	let browser: Browser;
	let page: Page;
	const errors: string[] = [];
	let expecting = false;

	/** Until a (server-side) table shows the rows for its state: it's `aria-busy` until then. */
	const settled = async () => {
		await page.waitForLoadState("networkidle");
		await page.locator('[data-slot="data-table"][aria-busy="true"]').waitFor({ state: "detached" });
	};
	const app: App = {
		get page() {
			return page;
		},
		async go(path) {
			const response = await page.goto(new URL(path, baseURL).href);
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
			await page.waitForLoadState("networkidle");
		},
		async switchOrganization(name) {
			await page.locator('[data-sidebar="header"] button').first().click();
			await page.getByRole("menuitem", { name }).click();
			await page.waitForURL((url) => url.pathname === "/");
			await page.waitForLoadState("networkidle");
		},
		async submit(target) {
			const [response] = await Promise.all([
				page.waitForResponse(
					(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
				),
				target.click(),
			]);
			const body = await response.text();
			await page.waitForLoadState("networkidle");
			return body;
		},
		async expectingErrors(steps) {
			expecting = true;
			try {
				const result = await steps();
				// Errors from loading the outcome (e.g. an error page) still count as expected.
				await page.waitForLoadState("networkidle");
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
		toast: (text) => page.locator("[data-sonner-toast]", { hasText: text }).first().waitFor(),
		async anotherTab() {
			// The page has a context of its own, so a new context with its cookies.
			const context = await browser.newContext({
				locale: BROWSER_LOCALE,
				storageState: await page.context().storageState(),
			});
			return context.newPage();
		},
	};

	beforeAll(async () => {
		browser = await chromium.launch();
		page = await browser.newPage({ viewport, locale: BROWSER_LOCALE });
		page.on("pageerror", (error) => expecting || errors.push(`pageerror: ${error.message}`));
		page.on("console", (message) => {
			const text = message.text();
			// A page that is a 404 on purpose logs the failed document request.
			if (/status of 404/.test(text)) return;
			if (message.type() === "error" && !expecting) errors.push(`error: ${text}`);
			else if (/hydrat/i.test(text)) errors.push(`${message.type()}: ${text}`);
		});
		if (user) await app.signIn(user);
	});

	afterEach(() => {
		const logged = errors.splice(0);
		expect(logged, "console errors and hydration warnings").toEqual([]);
	});

	afterAll(async () => {
		await browser?.close();
	});

	return app;
}
