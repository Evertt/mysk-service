/**
 * The user menus' "View as" in the SHLTR demo (`viewAs` in `src/routes/demo.remote.ts`): from the
 * office, the engineer portal (on a phone and in the desk's phone frame) and the customer portal
 * to each other role, ending the old session; only for SHLTR's sessions, only with
 * `DEMO_SIGN_IN` (the lanes' servers have it, one of this file's own hasn't).
 */
import { hashPassword } from "better-auth/crypto";
import type { BrowserContext, Locator } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD, demoOrganizations } from "#lib/server/db/demo.ts";

import {
	baseURL,
	fixture,
	hydrated,
	newContext,
	onPhone,
	quiet,
	rows,
	useApp,
	users,
} from "./app.ts";
import { startServer } from "./global-setup.ts";
import { lane } from "./lane.ts";

const app = useApp({ user: users.shltrPlanner });

const shltr = demoOrganizations.shltr;

/** Each role's home and demo user, as the switch's items name them. */
const roles = {
	Planner: { path: "/", email: users.shltrPlanner, name: "Jan Weggemans" },
	Engineer: { path: "/my", email: users.shltrEngineer, name: "Lev Hoekstra" },
	Customer: { path: "/portal", email: users.riedel, name: "Marieke Verhoeven" },
};
type Role = keyof typeof roles;

/** Where the switch is: in the office's user menu, or a button in a portal's header. */
type Side = "office" | "portal";

/** The view-as form's action (`?/remote=<id>`), the same on every server of the build. */
let action: string;
/** The name its items post the role as (`role/<id>`). */
let roleField: string;

/** The session the browser's cookie is for: its token, and the row (none once it's ended). */
async function session(context: BrowserContext = app.page.context()) {
	const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
	const token = decodeURIComponent(cookie?.value ?? "").split(".")[0];
	const [row] = await rows<{ email: string; organization: string | null }>(
		`select u.email, s.active_organization_id as organization from session s
		 join user u on u.id = s.user_id where s.token = ?`,
		[token],
	);
	return { token, row };
}

/** The browser's cookies, as a request's `cookie` header. */
const cookieHeader = async (context: BrowserContext = app.page.context()) =>
	(await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

/** Opens the menu with the switch, or the user menu where there's none (`side: "office"`). */
async function openMenu(side: Side): Promise<Locator> {
	const { page } = app;
	if (side === "office") await page.locator('[data-slot="sidebar-footer"] button').first().click();
	else await page.getByRole("button", { name: /^View as/ }).click();
	const menu = page.getByRole("menu");
	await menu.waitFor();
	return menu;
}

/** The switch's items in the open menu, and which is checked. */
async function items(menu: Locator) {
	const radios = menu.getByRole("menuitemradio");
	const names = await radios.allInnerTexts();
	const checked = await radios.evaluateAll((elements) =>
		elements.filter((e) => e.getAttribute("aria-checked") === "true").map((e) => e.textContent),
	);
	return { names: names.map((name) => name.trim()), checked: checked.map((name) => name?.trim()) };
}

/** Who the page shows signed in: the sidebar's footer in the office, the header in a portal. */
async function shownUser(role: Role) {
	const { page } = app;
	return role === "Planner"
		? page.locator('[data-slot="sidebar-footer"]').innerText()
		: page.locator("header").first().innerText();
}

/**
 * Views the demo as `to` from the switch on `side` (or in `menu`, if it's open), which shows `from`
 * checked: lands on its home, signed in as its user in SHLTR, with the previous session gone.
 */
async function switchTo(side: Side, from: Role, to: Role, menu?: Locator) {
	const { page } = app;
	const before = await session();
	expect(before.row?.email).toBe(roles[from].email);
	menu ??= await openMenu(side);
	expect(await items(menu)).toEqual({
		names: ["Planner", "Engineer", "Customer"],
		checked: [from],
	});
	await Promise.all([
		page.waitForURL((url) => url.pathname === roles[to].path),
		menu.getByRole("menuitemradio", { name: to }).click(),
	]);
	await hydrated(page);
	await quiet(page);

	// The office's sidebar (where it shows who's signed in) is a closed sheet on a phone.
	if (to !== "Planner" || page.viewportSize()!.width >= 1024) {
		expect(await shownUser(to)).toContain(roles[to].name);
	}
	const after = await session();
	expect(after.row).toEqual({ email: roles[to].email, organization: shltr.id });
	expect(after.token).not.toBe(before.token);
	expect(await rows("select id from session where token = ?", [before.token])).toEqual([]);
}

/** Signs out of the office or a portal, back to the login page. */
async function signOut(side: Side) {
	const { page } = app;
	if (side === "office") {
		await openMenu("office");
		await page.getByRole("menuitem", { name: "Sign out" }).click();
	} else {
		await page.getByRole("button", { name: "Sign out" }).click();
	}
	await page.waitForURL((url) => url.pathname === "/login");
}

/**
 * Posts to the view-as form without JavaScript, as a browser would, or as someone tampering: as
 * whoever `cookie` is for, `role` as the items post it (none: left out), `unbound` fields under
 * names of their own.
 */
const post = (
	origin: string,
	cookie: string | null,
	role?: string,
	unbound: Record<string, string> = {},
	from = origin,
) =>
	fetch(new URL(`/login${action}`, origin), {
		method: "POST",
		// A browser's `accept`: with fetch's `*/*`, SvelteKit takes it for a JSON action request.
		headers: {
			origin: from,
			accept: "text/html",
			"accept-language": "en",
			...(cookie ? { cookie } : {}),
		},
		body: new URLSearchParams({ ...(role === undefined ? {} : { [roleField]: role }), ...unbound }),
		redirect: "manual",
	});

/** Whether a response signs someone in: it sets better-auth's session cookie to a value. */
const signsIn = (response: Response) =>
	response.headers
		.getSetCookie()
		.some((cookie) => /session_token=[^;]/.test(cookie) && !/max-age=0/i.test(cookie));

describe("with DEMO_SIGN_IN, in SHLTR", () => {
	test("the office's user menu has View as above Sign out, Planner checked", async () => {
		const { page } = app;
		const menu = await openMenu("office");
		expect(await items(menu)).toEqual({
			names: ["Planner", "Engineer", "Customer"],
			checked: ["Planner"],
		});
		const texts = await menu.innerText();
		expect(texts.indexOf("View as")).toBeGreaterThan(-1);
		expect(texts.indexOf("View as")).toBeLessThan(texts.indexOf("Sign out"));
		// (`has` takes a locator relative to the form, so not one from the menu.)
		const engineer = page.getByRole("menuitemradio", { name: "Engineer" });
		action = (await page.locator("form").filter({ has: engineer }).getAttribute("action"))!;
		roleField = (await engineer.getAttribute("name"))!;
		expect(action).toMatch(/^\?\/remote=/);
		expect(roleField).toMatch(/^role\//);
		expect(await engineer.getAttribute("value")).toBe("engineer");
		await page.keyboard.press("Escape");
		await menu.waitFor({ state: "detached" });
	});

	test("from the office to the engineer portal, as Lev", async () => {
		await switchTo("office", "Planner", "Engineer");
		expect(await app.page.locator("header").first().innerText()).toContain(shltr.name);
	});

	test("from the engineer portal in the desk's phone frame to the customer portal", async () => {
		const { page } = app;
		await page.locator("[data-phone-frame]").waitFor();
		const menu = await openMenu("portal");
		// In the phone's screen, not in <body>, and painted within it.
		expect(await page.locator("[data-phone-overlays]").getByRole("menu").count()).toBe(1);
		const [inner, outer] = await Promise.all([
			menu.boundingBox(),
			page.locator("[data-phone-screen]").boundingBox(),
		]);
		expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 1);
		expect(inner!.y).toBeGreaterThanOrEqual(outer!.y - 1);
		expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 1);
		expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 1);
		await switchTo("portal", "Engineer", "Customer", menu);
		expect(await page.locator("header").first().innerText()).toContain("Riedel B.V.");
	});

	test("from the customer portal to the office, as Jan", async () => {
		await switchTo("portal", "Customer", "Planner");
	});

	// The office's switch to the customer portal, and the customer portal's to the engineer portal,
	// are the same forms as the ones above with another role (the roles' homes and users are
	// `demo-accounts.spec.ts`'s).
	test("from the engineer portal on a phone to the office", async () => {
		const { page } = app;
		await switchTo("office", "Planner", "Engineer");
		await onPhone(page, async () => {
			expect(
				await page.locator("[data-phone-overlays]").evaluate((e) => getComputedStyle(e).display),
			).toBe("contents");
			await switchTo("portal", "Engineer", "Planner");
		});
		expect(await shownUser("Planner")).toContain(roles.Planner.name);
	});

	test("its current role only closes the menu", async () => {
		const { page } = app;
		const before = await session();
		const menu = await openMenu("office");
		await menu.getByRole("menuitemradio", { name: "Planner" }).click();
		await menu.waitFor({ state: "detached" });
		await quiet(page);
		expect(app.path()).toBe("/");
		expect((await session()).token).toBe(before.token);
	});

	test("anything but a demo role is refused, and the session stays", async () => {
		const cookie = await cookieHeader();
		const own = await session();
		const before = await rows("select id from session order by id");
		for (const role of [
			// No owner or admin any more, whatever it's called.
			"owner",
			"admin",
			"Admin",
			"Planner",
			"member",
			"owner@shltr.example",
			"admin@fieldworks.example",
			"org-shltr",
			"__proto__",
			"constructor",
			"",
			undefined,
		]) {
			const response = await post(baseURL, cookie, role);
			expect(response.status, String(role)).toBe(400);
			expect(signsIn(response), String(role)).toBe(false);
		}
		// Fields the form hasn't (an email, a user id): SvelteKit refuses them before the handler.
		for (const unbound of [{ email: "admin@fieldworks.example" }, { userId: "anything" }] as Record<
			string,
			string
		>[]) {
			const response = await post(baseURL, cookie, "customer", unbound);
			expect(response.status, JSON.stringify(unbound)).not.toBe(303);
			expect(signsIn(response), JSON.stringify(unbound)).toBe(false);
		}
		// From another site.
		const response = await post(baseURL, cookie, "customer", {}, "https://evil.example");
		expect(response.status).toBe(403);
		expect(signsIn(response)).toBe(false);

		expect(await rows("select id from session order by id")).toEqual(before);
		expect((await session()).row).toEqual(own.row);
	});

	test("to an account whose password changed, a 404 that leaves the session as it was", async () => {
		const cookie = await cookieHeader();
		const own = await session();
		const before = await rows("select id from session order by id");
		const credential = `user_id = (select id from user where email = ?) and provider_id = 'credential'`;
		const [{ password }] = await rows<{ password: string }>(
			`select password from account where ${credential}`,
			[users.shltrEngineer],
		);
		await fixture(`update account set password = ? where ${credential}`, [
			await hashPassword("not-the-demo-password"),
			users.shltrEngineer,
		]);
		try {
			const response = await post(baseURL, cookie, "engineer");
			expect(response.status).toBe(404);
			// Neither a new session's cookie nor the old one's cleared.
			expect(response.headers.getSetCookie().filter((c) => c.includes("session_token="))).toEqual(
				[],
			);
		} finally {
			await fixture(`update account set password = ? where ${credential}`, [
				password,
				users.shltrEngineer,
			]);
		}
		expect(await rows("select id from session order by id")).toEqual(before);
		expect(await session()).toEqual(own);
		await app.go("/");
		expect(await shownUser("Planner")).toContain(roles.Planner.name);
	});

	test("signed out, the switch is a 404", async () => {
		const before = await rows("select id from session order by id");
		for (const role of ["planner", "engineer", "customer"]) {
			const response = await post(baseURL, null, role);
			expect(response.status, role).toBe(404);
			expect(signsIn(response), role).toBe(false);
		}
		expect(await rows("select id from session order by id")).toEqual(before);
	});
});

describe("other tenants' users", () => {
	test("North's admin has no View as, and the switch is a 404 to them", async () => {
		const { page } = app;
		await signOut("office");
		await app.signIn(users.admin);
		const menu = await openMenu("office");
		expect(await menu.getByRole("menuitem", { name: "Sign out" }).isVisible()).toBe(true);
		expect(await menu.getByRole("menuitemradio").allInnerTexts()).not.toContain("Planner");
		expect(await menu.innerText()).not.toContain("View as");
		await page.keyboard.press("Escape");

		const own = await session();
		const before = await rows("select id from session order by id");
		for (const role of ["planner", "engineer", "customer"]) {
			const response = await post(baseURL, await cookieHeader(), role);
			expect(response.status, role).toBe(404);
			expect(signsIn(response), role).toBe(false);
		}
		expect(await rows("select id from session order by id")).toEqual(before);
		expect((await session()).row).toEqual(own.row);
	});

	test("North's engineer and customer have none in their portals", async () => {
		const { page } = app;
		await signOut("office");
		await app.signIn(users.engineer);
		expect(app.path()).toBe("/my");
		expect(await page.getByRole("button", { name: "Sign out" }).isVisible()).toBe(true);
		expect(await page.getByRole("button", { name: /^View as/ }).count()).toBe(0);

		await signOut("portal");
		await app.signIn(users.northCustomer);
		expect(app.path()).toBe("/portal");
		expect(await page.getByRole("button", { name: "Sign out" }).isVisible()).toBe(true);
		expect(await page.getByRole("button", { name: /^View as/ }).count()).toBe(0);
		await signOut("portal");
	});

	test("SHLTR's other people have it, nothing checked", async () => {
		const { page } = app;
		await app.signIn(users.weggemans);
		expect(app.path()).toBe("/portal");
		const menu = await openMenu("portal");
		expect(await items(menu)).toEqual({ names: ["Planner", "Engineer", "Customer"], checked: [] });
		await page.keyboard.press("Escape");
		await signOut("portal");
	});

	test("SHLTR's owner too, who is no role of the demo's", async () => {
		const { page } = app;
		await app.signIn(users.shltrOwner);
		const menu = await openMenu("office");
		expect(await items(menu)).toEqual({ names: ["Planner", "Engineer", "Customer"], checked: [] });
		await page.keyboard.press("Escape");
		await menu.waitFor({ state: "detached" });
		await signOut("office");
	});
});

describe("without DEMO_SIGN_IN", () => {
	let server: Awaited<ReturnType<typeof startServer>>;
	let context: BrowserContext;

	beforeAll(async () => {
		// The lane's database and a mail outbox of its own.
		server = await startServer(lane.databaseURL, `${lane.outbox}.no-view-as`, {
			DEMO_SIGN_IN: "false",
		});
		context = await newContext(app.page.context().browser()!, {
			viewport: { width: 1440, height: 1000 },
		});
	}, 90_000);

	afterAll(async () => {
		await context?.close();
		await server?.stop();
	});

	/** Signs in on the server without the flag, in a page of its own. */
	async function signInThere(email: string) {
		await context.clearCookies();
		const page = await context.newPage();
		await page.goto(new URL("/login", server.baseURL).href);
		await hydrated(page);
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(DEMO_PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL((url) => url.pathname !== "/login");
		await hydrated(page);
		await quiet(page);
		return page;
	}

	test("the office's user menu has no View as", async () => {
		const page = await signInThere(users.shltrOwner);
		await page.locator('[data-slot="sidebar-footer"] button').first().click();
		const menu = page.getByRole("menu");
		await menu.getByRole("menuitem", { name: "Sign out" }).waitFor();
		expect(await menu.innerText()).not.toContain("View as");
		expect(await menu.getByRole("menuitemradio", { name: "Engineer" }).count()).toBe(0);
		await page.close();
	});

	test("nor have the portals", async () => {
		for (const [email, path] of [
			[users.shltrEngineer, "/my"],
			[users.riedel, "/portal"],
		]) {
			const page = await signInThere(email);
			expect(new URL(page.url()).pathname, email).toBe(path);
			expect(await page.getByRole("button", { name: "Sign out" }).isVisible(), email).toBe(true);
			expect(await page.getByRole("button", { name: /^View as/ }).count(), email).toBe(0);
			await page.close();
		}
	});

	test("the switch is a 404, whatever is posted, and the session stays", async () => {
		const page = await signInThere(users.shltrOwner);
		const own = await session(context);
		expect(own.row).toEqual({ email: users.shltrOwner, organization: shltr.id });
		const before = await rows("select id from session order by id");
		for (const role of ["planner", "engineer", "customer", "admin", "owner", "", undefined]) {
			const response = await post(server.baseURL, await cookieHeader(context), role);
			expect(response.status, String(role)).toBe(404);
			expect(signsIn(response), String(role)).toBe(false);
		}
		expect(await rows("select id from session order by id")).toEqual(before);
		expect((await session(context)).row).toEqual(own.row);
		await page.close();
	});
});
