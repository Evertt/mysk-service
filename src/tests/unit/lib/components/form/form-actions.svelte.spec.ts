import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import FormActions from "#lib/components/form/form-actions.svelte";

test("a submit button, and a cancel link when there's somewhere to go back to", async () => {
	render(FormActions, { submitLabel: "Create order", cancelHref: "/orders" });

	await expect
		.element(page.getByRole("button", { name: "Create order" }))
		.toHaveAttribute("type", "submit");
	await expect
		.element(page.getByRole("link", { name: "Cancel" }))
		.toHaveAttribute("href", "/orders");
});

test("saves by default, without a cancel link", async () => {
	render(FormActions, {});

	await expect.element(page.getByRole("button", { name: "Save" })).toBeEnabled();
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("the submit button is disabled with a spinner while a submission is pending", async () => {
	render(FormActions, { pending: 2 });

	// The spinner is part of its name.
	const submit = page.getByRole("button", { name: "Loading Save" });
	await expect.element(submit).toBeDisabled();
	await expect.element(submit.getByRole("status", { name: "Loading" })).toBeInTheDocument();
});
