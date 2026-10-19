/**
 * Bug reports: the record button in the office's header records a session (a click, typing, a
 * navigation, a password that stays out of the recording), stops for a note and sends it; the
 * engineer portal's menu starts one too, and its header shows the button while it records; a developer opens the report and its replay, which is a 404
 * for anyone else. What the upload refuses and stores, and who may read the reports, is
 * `src/tests/unit/lib/server/bug-reports/upload.spec.ts`'s.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import type { Page } from "playwright";
import { afterAll, describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	hydrated,
	newContext,
	organizations,
	quiet,
	rows,
	sentMail,
	signInContext,
	useApp,
	userNames,
	users,
} from "./app.ts";
import { bugReportEmail, bugReportsFolder, developerEmail } from "./global-setup.ts";
import { lane } from "./lane.ts";
import { openFieldMenu } from "./portal-helpers.ts";

const app = useApp();

/** The pages of others (a developer, an engineer), closed after the file. */
const others: Page[] = [];
afterAll(() => Promise.all(others.map((page) => page.context().close())));

/** A page of its own, signed in as `email`, at `path`. */
async function pageOf(email: string, path: string) {
	const context = await newContext(app.page.context().browser()!, {
		viewport: { width: 1440, height: 1000 },
	});
	await signInContext(context, email);
	const page = await context.newPage();
	others.push(page);
	await page.goto(new URL(path, baseURL).href);
	await hydrated(page);
	return page;
}

/** How long a step waits for the page: a failure then names the step, not just the test. */
const step = { timeout: 15_000 };

const recordButton = (page: Page) => page.locator('[data-slot="bug-report-button"]');
/** Waits until the record button is in `phase` (`idle`, `recording`, …). */
async function inPhase(page: Page, phase: string) {
	const button = page.locator(`[data-slot="bug-report-button"][data-phase="${phase}"]`);
	await button.waitFor(step);
	expect(await button.count()).toBe(1);
}
const note = "The list stayed empty after searching";
const secret = "hunter2-not-in-the-recording";

/** The report the record button's tests send, once it's in. */
let report: Record<string, string | number>;

describe("the record button", () => {
	test("starts recording the screen", async () => {
		const { page } = app;
		await app.go("/orders");
		expect(await recordButton(page).getAttribute("aria-label", step)).toBe("Report a problem");
		await recordButton(page).click(step);
		await app.toast("Recording your screen: click the red dot when you're done");
		await inPhase(page, "recording");
	});

	test("records clicks, typing, a password field and a navigation", async () => {
		const { page } = app;
		await page
			.getByPlaceholder(/^Search/)
			.first()
			.fill("pump", step);
		await quiet(page);
		// A password field, as a page with one would have.
		await page.evaluate(() => {
			const field = document.createElement("input");
			field.type = "password";
			field.id = "e2e-password";
			document.querySelector("[data-slot='sidebar-inset']")?.append(field);
		});
		await page.locator("#e2e-password").fill(secret, step);
		await page.getByRole("link", { name: "Customers" }).first().click(step);
		await page.waitForURL((url) => url.pathname === "/customers", step);
		await quiet(page);
		// Still recording, across the navigation.
		await inPhase(page, "recording");
	});

	test("stops for a note, and sends the report", async () => {
		const { page } = app;
		await recordButton(page).click(step);
		const review = page.locator('[data-slot="bug-report-review"]');
		await review.getByLabel("What went wrong?").fill(note, step);
		await review.getByRole("button", { name: "Send" }).click(step);
		await app.toast("Thanks, your report was sent");
		await inPhase(page, "idle");
	});

	test("stores the report under the user's tenant, and mails it", async () => {
		[report] = await rows<Record<string, string | number>>(
			"select * from bug_report where note = ?",
			[note],
		);
		expect(report).toMatchObject({
			organization_id: organizations.north.id,
			user_name: userNames.admin,
			route_id: "/(app)/orders",
		});
		expect(String(report.url)).toMatch(/\/orders/);

		const [mail] = sentMail(bugReportEmail).filter((sent) => sent.text.includes(note));
		expect(mail.subject).toBe(
			`Bug report from ${userNames.admin} at ${organizations.north.name}: ${note}`,
		);
		expect(mail.text).toContain(`/ops/bug-reports/${report.id}`);
	});

	test("keeps what's typed into a password field out of the recording", () => {
		const recording = gunzipSync(
			readFileSync(join(bugReportsFolder(lane.outbox), String(report.object_key))),
		).toString();
		// The field is in it, what was typed into it isn't.
		expect(recording).toContain("e2e-password");
		expect(recording).not.toContain(secret);
		// The page's requests are, as our own events.
		expect(recording).toContain('"tag":"request"');
	});

	test("is in the engineer portal too: started from its menu, in its header while it records", async () => {
		const page = await pageOf(users.engineer, "/my");
		// Not in the header while idle: the phone's header has no room for it.
		expect(await recordButton(page).count()).toBe(0);
		const menu = await openFieldMenu(page);
		await menu.getByRole("menuitem", { name: "Report a problem" }).click(step);
		await inPhase(page, "recording");
		expect(await page.locator("header [data-slot='bug-report-button']").count()).toBe(1);
		// Stopped from its dot, and discarded: out of the header again, back in the menu.
		await recordButton(page).click(step);
		const review = page.locator('[data-slot="bug-report-review"]');
		await review.getByRole("button", { name: "Discard" }).click(step);
		await recordButton(page).waitFor({ state: "detached", ...step });
		await openFieldMenu(page);
		await menu.getByRole("menuitem", { name: "Report a problem" }).waitFor(step);
		await page.keyboard.press("Escape");
	});
});

describe("the developers' pages", () => {
	let page: Page;

	test("list the reports", async () => {
		page = await pageOf(developerEmail, "/ops/bug-reports");
		const row = page.getByRole("row").filter({ hasText: note });
		expect(await row.innerText(step)).toContain(organizations.north.name);
		await row.getByRole("link").click(step);
		await page.waitForURL(`${baseURL}/ops/bug-reports/${report.id}`, step);
	});

	test("replay one, beside its note and requests", async () => {
		// rrweb-player is loaded once the recording is in.
		await page.locator('[data-slot="bug-report-player"] .rr-player').waitFor({ timeout: 20_000 });
		expect(await page.locator('[data-slot="bug-report-note"]').innerText(step)).toBe(note);
		const requests = page.locator('[data-slot="bug-report-requests"] button');
		expect(await requests.count()).toBeGreaterThan(0);
		// A request jumps the replay to its moment.
		await requests.first().click(step);
	});

	test("are a 404 for anyone else", async () => {
		const response = await app.expectingErrors(() => app.go("/ops/bug-reports"));
		expect(response?.status()).toBe(404);
	});
});
