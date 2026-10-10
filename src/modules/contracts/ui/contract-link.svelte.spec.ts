import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import ContractLink from "./contract-link.svelte";

test("links the contract number to the contract's page", async () => {
	render(ContractLink, { number: "SC-2026-0003" });

	await expect
		.element(page.getByRole("link", { name: "SC-2026-0003" }))
		.toHaveAttribute("href", "/contracts/SC-2026-0003");
});
