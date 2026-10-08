import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import EngineerLink from "./engineer-link.svelte";

test("links the engineer's name to their page", async () => {
	render(EngineerLink, { id: 7, name: "Sanne Bakker" });

	await expect
		.element(page.getByRole("link", { name: "Sanne Bakker" }))
		.toHaveAttribute("href", "/engineers/7");
});
