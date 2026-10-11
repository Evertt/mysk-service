import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import MoneyField from "#lib/components/form/money-field.svelte";

import { fakeField } from "./fake-form.ts";

test("shows an amount in cents as euros in a number input", async () => {
	render(MoneyField, { field: fakeField("price"), label: "Price", cents: 123456 });

	const input = page.getByRole("spinbutton", { name: "Price" });
	await expect.element(input).toHaveValue(1234.56);
	await expect.element(input).toHaveAttribute("type", "number");
	await expect.element(input).toHaveAttribute("step", "0.01");
	await expect.element(input).toHaveAttribute("min", "0");
	await expect.element(page.getByText("€")).toBeVisible();
});

test("zero cents is zero euros, not empty", async () => {
	render(MoneyField, { field: fakeField("price"), label: "Price", cents: 0 });

	await expect.element(page.getByRole("spinbutton", { name: "Price" })).toHaveValue(0);
});

test("starts empty without an amount", async () => {
	render(MoneyField, { field: fakeField("price"), label: "Price", cents: null });

	await expect.element(page.getByRole("spinbutton", { name: "Price" })).toHaveValue(null);
});

test("shows the field's issues", async () => {
	render(MoneyField, { field: fakeField("price", ["Price can't be negative"]), label: "Price" });

	await expect
		.element(page.getByRole("spinbutton", { name: "Price" }))
		.toHaveAttribute("aria-invalid", "true");
	await expect.element(page.getByRole("alert")).toHaveTextContent("Price can't be negative");
});
