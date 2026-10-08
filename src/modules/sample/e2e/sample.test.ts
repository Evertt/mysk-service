import { describe, expect, test } from "vite-plus/test";

import { isRemote, organizations, rows, useApp, value } from "#e2e/app.ts";

const { north, south } = organizations;
const app = useApp();

const sidebar = () => app.page.locator('[data-sidebar="content"]').innerText();
/** The remote queries the sample pages made in North, to replay them from South. */
const queries: string[] = [];

describe("in North, which has the module", () => {
	test("the section lists the notes inside the module's layout, and the sidebar links it", async () => {
		const { page } = app;
		page.on("request", (request) => {
			if (isRemote(request.url(), "listSampleNotes") && request.method() === "GET") {
				queries.push(request.url());
			}
		});
		await app.go("/");
		expect(await sidebar()).toContain("Sample");
		// Client-side, so the page loads its notes through the remote query.
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Sample" }).click();
		await page.waitForURL((url) => url.pathname === "/sample");
		await page.waitForLoadState("networkidle");

		await page.getByRole("heading", { name: "Sample notes" }).waitFor();
		// The layout's own load ran after the guard, and its children rendered inside it.
		const layout = page.getByTestId("sample-layout");
		expect(await layout.innerText()).toContain("Sample layout, module ready");
		const customer = await value<string>(
			`select c.name from sample_note n join customer c on c.id = n.customer_id where n.organization_id = ?`,
			[north.id],
		);
		await layout.getByRole("link", { name: `Hello from north (for ${customer})` }).waitFor();
		expect(queries.length).toBeGreaterThanOrEqual(1);
	});

	test("a dynamic child has its page option (a trailing slash) and typed params", async () => {
		const { page } = app;
		const id = await value<number>(`select id from sample_note where organization_id = ?`, [
			north.id,
		]);
		await page.getByRole("link", { name: /Hello from north/ }).click();
		await page.waitForURL((url) => url.pathname === `/sample/${id}/`);
		await page.getByRole("heading", { name: `Sample ${id}` }).waitFor();
		// Kit read `trailingSlash = "always"` from the stub: the server redirects without it.
		const response = await app.go(`/sample/${id}`);
		expect(response?.url()).toBe(new URL(`/sample/${id}/`, app.page.url()).href);
	});

	test("an error in the section is shown by the module's own error page", async () => {
		const response = await app.expectingErrors(() => app.go("/sample/boom/"));
		expect(response?.status()).toBe(418);
		await app.page.getByTestId("sample-error").waitFor();
		expect(await app.page.getByTestId("sample-error").innerText()).toContain("(418)");
		// Inside the module's layout, inside the app's.
		expect(await app.page.getByTestId("sample-layout").count()).toBe(1);
	});

	test("the endpoint answers, and the dashboard shows the module's card", async () => {
		const response = await app.page.request.get(new URL("/sample/1/pdf", app.page.url()).href);
		expect(response.status()).toBe(200);
		expect(await response.text()).toBe("sample 1");

		await app.go("/");
		const card = app.page.locator('main [data-slot="card"]', { hasText: "Sample notes" });
		await card.getByText("1 notes in this organization").waitFor();
	});
});

describe("in South, which doesn't have the module", () => {
	test("the sidebar lacks it and its pages and endpoint are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebar()).not.toContain("Sample");
		for (const path of ["/sample", "/sample/1/", "/sample/1/pdf"]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
		// The 404 is the app's own, not the module's.
		expect(await app.page.getByTestId("sample-layout").count()).toBe(0);
	});

	test("the dashboard has no card, and the module's queries are refused", async () => {
		await app.go("/");
		expect(
			await app.page.locator('main [data-slot="card"]', { hasText: "Sample notes" }).count(),
		).toBe(0);
		expect(queries.length).toBeGreaterThanOrEqual(1);
		for (const url of queries) {
			const response = await app.page.context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
			expect(body).not.toContain("Hello from north");
		}
	});

	test("the notes stay North's", async () => {
		expect(await rows(`select organization_id from sample_note order by id`)).toEqual([
			{ organization_id: north.id },
		]);
		expect(south.id).not.toBe(north.id);
	});
});
