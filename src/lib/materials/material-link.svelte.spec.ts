import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import MaterialLink from "./material-link.svelte";

test("links the material's name to its page, with its SKU below", async () => {
	render(MaterialLink, { sku: "FLT-200", name: "Air filter 200 mm" });

	await expect
		.element(page.getByRole("link", { name: "Air filter 200 mm" }))
		.toHaveAttribute("href", "/materials/FLT-200");
	await expect.element(page.getByText("FLT-200")).toHaveClass("text-muted-foreground");
});
