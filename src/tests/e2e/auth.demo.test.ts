/**
 * The login page's one-click demo sign-in (`src/routes/login/demo.remote.ts`): on the lanes'
 * servers, which have `DEMO_SIGN_IN=true`, and on one of this file's own without it.
 */
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { demoOrganizations } from "#lib/server/db/demo.ts";

import { baseURL, rows, useApp } from "./app.ts";
import { startServer } from "./global-setup.ts";
import { lane } from "./lane.ts";

const app = useApp({ user: null });

const shltr = demoOrganizations.shltr;

/** The demo form's action (`?/remote=<id>`), the same on every server of the build. */
let action: string;
/** The name its buttons post the role as (`role/<id>`: SvelteKit binds a field to its form). */
let roleField: string;

/**
 * Posts to the demo form without JavaScript, as a browser would, or as someone tampering: `role`
 * as the buttons post it (none: left out), and `unbound` fields under names of their own.
 */
const post = (origin: string, role?: string, unbound: Record<string, string> = {}) =>
	fetch(new URL(`/login${action}`, origin), {
		method: "POST",
		// A browser's `accept`: with fetch's `*/*`, SvelteKit takes it for a JSON action request.
		headers: { origin, accept: "text/html", "accept-language": "en" },
		body: new URLSearchParams({ ...(role === undefined ? {} : { [roleField]: role }), ...unbound }),
		redirect: "manual",
	});

/** Whether a response signs someone in: it sets better-auth's session cookie. */
const signsIn = (response: Response) =>
	response.headers.getSetCookie().some((cookie) => cookie.includes("session_token="));

/** The organization of the user's latest session, and how many sessions they have. */
async function sessions(email: string) {
	const found = await rows<{ organization: string | null }>(
		`select s.active_organization_id as organization from session s
		 join user u on u.id = s.user_id where u.email = ? order by s.created_at desc`,
		[email],
	);
	return { latest: found[0]?.organization, count: found.length };
}

/**
 * Signs out with the engineer or customer portal's button, back to the login page. Their sign-out
 * logs errors in the browser whoever signed in, with the form as much as with a demo button (the
 * portal's queries, refreshed once the session is gone), so they're expected here.
 */
async function signOutOfPortal() {
	const { page } = app;
	await app.expectingErrors(async () => {
		await page.getByRole("button", { name: "Sign out" }).click();
		await page.waitForURL((url) => url.pathname === "/login");
	});
}

describe("with DEMO_SIGN_IN", () => {
	test("the login page has the demo's buttons under its form", async () => {
		const { page } = app;
		await app.go("/login");
		expect(await page.getByText("Log in as:").isVisible()).toBe(true);
		for (const name of ["Admin", "Engineer", "Customer"]) {
			expect(await page.getByRole("button", { name, exact: true }).isVisible(), name).toBe(true);
		}
		expect(await page.getByText("The SHLTR demo").isVisible()).toBe(true);
		const admin = page.getByRole("button", { name: "Admin", exact: true });
		action = (await page.locator("form").filter({ has: admin }).getAttribute("action"))!;
		roleField = (await admin.getAttribute("name"))!;
		expect(action).toMatch(/^\?\/remote=/);
		expect(roleField).toMatch(/^role\//);
		expect(await admin.getAttribute("value")).toBe("admin");
	});

	test("Admin signs in as SHLTR's owner, on the office dashboard", async () => {
		const { page } = app;
		const before = await sessions("owner@shltr.example");
		await page.getByRole("button", { name: "Admin", exact: true }).click();
		await page.waitForURL((url) => url.pathname === "/");
		await app.go("/");
		expect(await page.locator('[data-slot="sidebar-footer"]').innerText()).toContain(
			"Marloes Hendriks",
		);
		expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(shltr.name);
		expect(await sessions("owner@shltr.example")).toEqual({
			latest: shltr.id,
			count: before.count + 1,
		});
	});

	test("its session signs out as any other", async () => {
		const { page } = app;
		await page.locator('[data-slot="sidebar-footer"] button').first().click();
		await page.getByRole("menuitem", { name: "Sign out" }).click();
		await page.waitForURL((url) => url.pathname === "/login");
		await app.go("/orders");
		expect(app.path()).toBe("/login");
	});

	test("Engineer signs in as Lev, in SHLTR's engineer portal", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Engineer", exact: true }).click();
		await page.waitForURL((url) => url.pathname === "/my");
		await app.go("/my");
		const header = await page.locator("header").first().innerText();
		expect(header).toContain("Lev Hoekstra");
		expect(header).toContain(shltr.name);
		expect((await sessions("lev@shltr.example")).latest).toBe(shltr.id);

		await signOutOfPortal();
		await app.go("/my");
		expect(app.path()).toBe("/login");
	});

	test("Customer signs in as Riedel's contact, in SHLTR's customer portal", async () => {
		const { page } = app;
		await app.go("/login");
		await page.getByRole("button", { name: "Customer", exact: true }).click();
		await page.waitForURL((url) => url.pathname === "/portal");
		await app.go("/portal");
		const header = await page.locator("header").first().innerText();
		expect(header).toContain("Riedel B.V.");
		expect(header).toContain("Marieke Verhoeven");
		expect(header).toContain(shltr.name);
		expect((await sessions("facilitair@riedel.example")).latest).toBe(shltr.id);

		await signOutOfPortal();
		await app.go("/portal");
		expect(app.path()).toBe("/login");
	});

	test("works without JavaScript, as a plain form post", async () => {
		const response = await post(baseURL, "engineer");
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("/my");
		expect(signsIn(response)).toBe(true);
	});

	test("anything but a demo role is refused, and signs no one in", async () => {
		const before = await rows("select id from session");
		for (const role of [
			"owner",
			"planner",
			"Admin",
			"owner@shltr.example",
			"admin@fieldworks.example",
			"org-shltr",
			"__proto__",
			"constructor",
			"",
			undefined,
		]) {
			const response = await post(baseURL, role);
			expect(response.status, String(role)).toBe(400);
			expect(signsIn(response), String(role)).toBe(false);
		}
		// Fields the form hasn't (an email, a user id): SvelteKit refuses them before the handler.
		for (const unbound of [{ email: "admin@fieldworks.example" }, { userId: "anything" }] as Record<
			string,
			string
		>[]) {
			const response = await post(baseURL, "admin", unbound);
			expect(response.ok, JSON.stringify(unbound)).toBe(false);
			expect(response.status, JSON.stringify(unbound)).not.toBe(303);
			expect(signsIn(response), JSON.stringify(unbound)).toBe(false);
		}
		expect(await rows("select id from session")).toEqual(before);
	});

	test("an email posted with the role is ignored: the role's own account signs in", async () => {
		const other = await sessions("admin@fieldworks.example");
		const owner = await sessions("owner@shltr.example");
		const email = roleField.replace(/^role/, "email");
		const response = await post(baseURL, "admin", { [email]: "admin@fieldworks.example" });
		expect(response.status).toBe(303);
		expect(await sessions("admin@fieldworks.example")).toEqual(other);
		expect(await sessions("owner@shltr.example")).toEqual({
			latest: shltr.id,
			count: owner.count + 1,
		});
	});

	test("a post from another site is refused", async () => {
		const response = await fetch(new URL(`/login${action}`, baseURL), {
			method: "POST",
			headers: { origin: "https://evil.example", accept: "text/html" },
			body: new URLSearchParams({ [roleField]: "admin" }),
			redirect: "manual",
		});
		expect(response.status).toBe(403);
		expect(signsIn(response)).toBe(false);
	});
});

describe("without DEMO_SIGN_IN", () => {
	let server: Awaited<ReturnType<typeof startServer>>;

	beforeAll(async () => {
		// The lane's database (only read: nothing here signs in) and a mail outbox of its own.
		server = await startServer(lane.databaseURL, `${lane.outbox}.no-demo`, {
			DEMO_SIGN_IN: "false",
		});
	}, 90_000);

	afterAll(async () => {
		await server?.stop();
	});

	test("the login page has no demo buttons", async () => {
		const html = await (
			await fetch(new URL("/login", server.baseURL), { headers: { "accept-language": "en" } })
		).text();
		expect(html).toContain("Sign in");
		expect(html).not.toContain("Log in as:");
		expect(html).not.toContain(">Engineer<");
	});

	test("the demo form is a 404, whatever is posted", async () => {
		const before = await rows("select id from session");
		for (const role of ["admin", "engineer", "customer", "owner", "", undefined]) {
			const response = await post(server.baseURL, role);
			expect(response.status, String(role)).toBe(404);
			expect(signsIn(response), String(role)).toBe(false);
		}
		// An unbound field is refused by SvelteKit before the handler, as on any server.
		const unbound = await post(server.baseURL, "admin", { email: "owner@shltr.example" });
		expect(unbound.ok).toBe(false);
		expect(signsIn(unbound)).toBe(false);
		expect(await rows("select id from session")).toEqual(before);
	});
});
