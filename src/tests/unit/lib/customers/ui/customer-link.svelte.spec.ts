import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import CustomerLink from "#lib/customers/ui/customer-link.svelte";

test("links the customer's name to their page", async () => {
	render(CustomerLink, { code: "C-0012", name: "Acme B.V." });

	await expect
		.element(page.getByRole("link", { name: "Acme B.V." }))
		.toHaveAttribute("href", "/customers/C-0012");
	expect(page.getByText("C-0012").elements()).toHaveLength(0);
});

test("with withCode, shows the code below the name", async () => {
	render(CustomerLink, { code: "C-0012", name: "Acme B.V.", withCode: true });

	await expect
		.element(page.getByRole("link", { name: "Acme B.V." }))
		.toHaveAttribute("href", "/customers/C-0012");
	await expect.element(page.getByText("C-0012")).toHaveClass("text-muted-foreground");
});
