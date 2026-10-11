import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import EquipmentLink from "#lib/equipment/ui/equipment-link.svelte";

test("links the serial number to the unit's page", async () => {
	render(EquipmentLink, { serialNumber: "GEN-0007" });

	await expect
		.element(page.getByRole("link", { name: "GEN-0007" }))
		.toHaveAttribute("href", "/equipment/GEN-0007");
});

test("shows its children instead of the serial number", async () => {
	render(EquipmentLink, {
		serialNumber: "GEN-0007",
		children: createRawSnippet(() => ({ render: () => "<span>Backup generator</span>" })),
	});

	await expect
		.element(page.getByRole("link", { name: "Backup generator" }))
		.toHaveAttribute("href", "/equipment/GEN-0007");
	expect(page.getByText("GEN-0007").elements()).toHaveLength(0);
});
