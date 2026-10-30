import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import TenancySimulator from "#wiki/widgets/tenancy-simulator/tenancy-simulator.svelte";

const rows = () => page.getByRole("table").getByRole("row");

test("scoped, North gets its own three orders", async () => {
	await render(TenancySimulator);
	await expect.element(page.getByLabelText("The query")).toBeVisible();
	expect(document.querySelector("pre")?.textContent).toContain(".where(inTenant(order))");
	// A header row and three of North's.
	await expect.poll(() => rows().all().length).toBe(4);
	expect(document.querySelectorAll("[data-leak]")).toHaveLength(0);
});

test("without the scope, North reads South's orders: the leak", async () => {
	await render(TenancySimulator);
	await page.getByRole("switch", { name: "Scoped with inTenant()" }).click();

	await expect.poll(() => rows().all().length).toBe(7);
	expect(document.querySelectorAll("[data-leak]")).toHaveLength(3);
	await expect.element(page.getByText("A leak")).toBeVisible();
});

test("scoped, a South id asked for as North is a 404; unscoped, it leaks", async () => {
	await render(TenancySimulator);
	await page.getByLabelText("Reading").selectOptions("the order with id 2 (South's)");

	await expect.element(page.getByText("404 Not found")).toBeVisible();
	expect(document.querySelector("table")).toBeNull();

	await page.getByRole("switch", { name: "Scoped with inTenant()" }).click();
	await expect.poll(() => document.querySelectorAll("[data-leak]").length).toBe(1);
});
