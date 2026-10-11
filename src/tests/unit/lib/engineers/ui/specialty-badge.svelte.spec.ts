import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import SpecialtyBadge from "#lib/engineers/ui/specialty-badge.svelte";
import type { EngineerSpecialty } from "#lib/models.ts";

test.each<[EngineerSpecialty, string]>([
	["electrical", "Electrical"],
	["mechanical", "Mechanical"],
	["hvac", "HVAC"],
	["plumbing", "Plumbing"],
	["controls", "Controls"],
])("%s shows as %s, with its icon", async (specialty, label) => {
	render(SpecialtyBadge, { specialty });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
