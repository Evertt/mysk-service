import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import ModuleMap from "#wiki/widgets/module-map/module-map.svelte";

const state = (id: string) =>
	document.querySelector(`[data-module="${id}"]`)?.getAttribute("data-state");

test("every module starts on, with its name and what it does", async () => {
	await render(ModuleMap);
	await expect.element(page.getByText("Invoicing", { exact: true }).first()).toBeVisible();
	expect(state("invoices")).toBe("on");
	expect(state("parts-shop")).toBe("on");
});

test("switching invoicing off drops what requires it, and switching it on brings them back", async () => {
	await render(ModuleMap);
	const invoices = page.getByRole("switch", { name: "Invoicing" });

	await invoices.click();

	await expect.poll(() => state("invoices")).toBe("off");
	expect(state("partner-programme")).toBe("dropped");
	expect(state("parts-shop")).toBe("dropped");
	expect(state("materials")).toBe("on");
	await expect.element(page.getByRole("switch", { name: "Parts shop" })).toBeChecked();

	await invoices.click();
	await expect.poll(() => state("parts-shop")).toBe("on");
});

test("the diagram draws what requires what in the modules' states", async () => {
	await render(ModuleMap);
	await page.getByRole("switch", { name: "Invoicing" }).click();

	await expect
		.poll(() =>
			document.querySelector('[data-node="partner-programme"]')?.getAttribute("data-state"),
		)
		.toBe("dropped");
	expect(
		document.querySelector('[data-requires="parts-shop"][data-to="materials"]'),
	).not.toBeNull();
});
