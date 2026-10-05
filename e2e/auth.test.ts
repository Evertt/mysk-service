import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "../src/lib/server/db/demo.ts";
import { baseURL, useApp, users } from "./app.ts";

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
		// As a string: vitest would rewrite an `import()` in a function.
		const status = await app.expectingErrors(() =>
			app.page.evaluate(`
				import("/src/routes/(app)/dashboard.remote.ts").then((remote) =>
					remote.getDashboard().then(() => "no error", (error) => error.status),
				)
			`),
		);
		expect(status).toBe(401);
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
		await page.waitForLoadState("networkidle");
		expect(await page.locator('[data-slot="sidebar-footer"]').innerText()).toContain("Avery Admin");
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
		const context = await app.page.context().browser()!.newContext({ javaScriptEnabled: false });
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
