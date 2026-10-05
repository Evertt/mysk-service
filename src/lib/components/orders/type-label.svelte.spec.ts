import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import TypeLabel from "./type-label.svelte";

test("shows the order type's label with its icon", async () => {
	render(TypeLabel, { type: "inspection" });

	const label = page.getByText("Inspection");
	await expect.element(label).toBeVisible();
	expect(label.element().querySelector("svg")).not.toBeNull();
});
