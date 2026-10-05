import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import CategoryLabel from "./category-label.svelte";

test("shows the category's label with its icon", async () => {
	render(CategoryLabel, { category: "air_handler" });

	const label = page.getByText("Air handler");
	await expect.element(label).toBeVisible();
	expect(label.element().querySelector("svg")).not.toBeNull();
});
