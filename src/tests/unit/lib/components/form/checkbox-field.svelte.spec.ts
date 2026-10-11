import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import CheckboxField from "#lib/components/form/checkbox-field.svelte";

import { fakeField } from "./fake-form.ts";

test("starts from the initial state", async () => {
	render(CheckboxField, { field: fakeField("active"), label: "Active", checked: true });

	await expect.element(page.getByRole("checkbox", { name: "Active" })).toBeChecked();
});

test("is unchecked by default, and the label toggles it", async () => {
	render(CheckboxField, { field: fakeField("active"), label: "Active" });

	const checkbox = page.getByRole("checkbox", { name: "Active" });
	await expect.element(checkbox).not.toBeChecked();

	await page.getByText("Active").click();
	await expect.element(checkbox).toBeChecked();

	await checkbox.click();
	await expect.element(checkbox).not.toBeChecked();
});

test("submits its state under the field's name", async () => {
	const { container } = await render(CheckboxField, {
		field: fakeField("active"),
		label: "Active",
	});

	await page.getByRole("checkbox", { name: "Active" }).click();

	const input = container.querySelector<HTMLInputElement>('input[name="active"]');
	expect(input?.checked).toBe(true);
});

test("shows the description and the field's issues", async () => {
	render(CheckboxField, {
		field: fakeField("active", ["An engineer with open orders stays active"]),
		label: "Active",
		description: "Inactive engineers can't be assigned new orders.",
	});

	await expect
		.element(page.getByText("Inactive engineers can't be assigned new orders."))
		.toBeVisible();
	await expect
		.element(page.getByRole("alert"))
		.toHaveTextContent("An engineer with open orders stays active");
	await expect
		.element(page.getByRole("checkbox", { name: "Active" }))
		.toHaveAttribute("aria-invalid", "true");
});
