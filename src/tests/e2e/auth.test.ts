import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";

import { BROWSER_OPTIONS, baseURL, hydrated, useApp, userNames, users, quiet } from "./app.ts";

const app = useApp({ user: null });

describe("signed out", () => {
	test("pages redirect to the login page, which remembers where you were going", async () => {
		await app.go("/orders?status=quote");
		expect(app.path()).toBe("/login");
		expect(new URL(app.page.url()).searchParams.get("redirectTo")).toBe("/orders?status=quote");
		await app.go("/");
		expect(app.page.url()).toBe(`${baseURL}/login`);
	});

	test("remote functions answer 401", async () => {
		// The dashboard's query as a signed-in tab calls it, then again without the session.
		const tab = await app.anotherTab();
		let url: string;
		try {
			const query = tab.waitForRequest((request) => request.url().includes("/getDashboard"));
			await tab.goto(`${baseURL}/login`);
			await hydrated(tab);
			await tab.getByLabel("Email").fill(users.admin);
			await tab.getByLabel("Password").fill(DEMO_PASSWORD);
			await tab.getByRole("button", { name: "Sign in" }).click();
			url = (await query).url();
		} finally {
			await tab.context().close();
		}
		const response = await fetch(url);
		expect(`${response.status} ${await response.text()}`).toMatch(/401|"status":401/);
	});

	test("better-auth's organization endpoints aren't exposed", async () => {
		const response = await fetch(`${baseURL}/api/auth/organization/list`);
		expect(response.status).toBe(404);
	});

	test("signing up is disabled", async () => {
		const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseURL },
			body: JSON.stringify({ email: "new@example.com", password: "a-long-password", name: "New" }),
		});
		expect(response.ok).toBe(false);
	});
});

describe("signing in", () => {
	test("an empty form shows what's missing", async () => {
		await app.go("/login?redirectTo=%2Forders");
		await app.submit(app.page.getByRole("button", { name: "Sign in" }));
		expect((await app.issues()).length).toBeGreaterThanOrEqual(2);
	});

	test("a wrong password is refused", async () => {
		const { page } = app;
		await page.getByLabel("Email").fill(users.admin);
		await page.getByLabel("Password").fill("wrong-password");
		await app.submit(page.getByRole("button", { name: "Sign in" }));
		await expect.poll(() => page.getByText("Incorrect email or password.").isVisible()).toBe(true);
		expect(app.path()).toBe("/login");
	});

	test("the right password goes where you were going", async () => {
		const { page } = app;
		await page.getByLabel("Password").fill(DEMO_PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		await quiet(page);
		expect(await page.locator('[data-slot="sidebar-footer"]').innerText()).toContain(
			userNames.admin,
		);
	});

	test("the login page sends signed-in users to the dashboard", async () => {
		await app.go("/login");
		expect(app.path()).toBe("/");
	});

	test("signing out ends the session", async () => {
		const { page } = app;
		await page.locator('[data-slot="sidebar-footer"] button').first().click();
		await page.getByRole("menuitem", { name: "Sign out" }).click();
		await page.waitForURL((url) => url.pathname === "/login");
		await app.go("/orders");
		expect(app.path()).toBe("/login");
	});

	test("a redirect to another site is ignored", async () => {
		const { page } = app;
		await app.go(`/login?redirectTo=${encodeURIComponent("//evil.example/x")}`);
		await page.getByLabel("Email").fill(users.planner);
		await page.getByLabel("Password").fill(DEMO_PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL((url) => url.origin === baseURL && url.pathname === "/");
		expect(app.page.url()).toBe(`${baseURL}/`);
	});

	test("works without JavaScript", async () => {
		const context = await app.page
			.context()
			.browser()!
			.newContext({ ...BROWSER_OPTIONS, javaScriptEnabled: false });
		try {
			const page = await context.newPage();
			await page.goto(`${baseURL}/orders`);
			await page.getByLabel("Email").fill(users.planner);
			await page.getByLabel("Password").fill("nope");
			await page.getByRole("button", { name: "Sign in" }).click();
			await page.waitForLoadState();
			expect(await page.getByText("Incorrect email or password.").isVisible()).toBe(true);
			expect(await page.getByLabel("Password").inputValue()).toBe("");

			await page.getByLabel("Password").fill(DEMO_PASSWORD);
			await page.getByRole("button", { name: "Sign in" }).click();
			await page.waitForURL((url) => url.pathname === "/orders");
			expect(new URL(page.url()).pathname).toBe("/orders");
		} finally {
			await context.close();
		}
	});
});
