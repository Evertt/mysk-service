import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { fakeField } from "./fake-form.ts";
import NumberField from "./number-field.svelte";

test("a number input with the initial value and its limits", async () => {
	render(NumberField, {
		field: fakeField("hours"),
		label: "Hours",
		value: 2.5,
		min: 0,
		max: 24,
		step: 0.25,
	});

	const input = page.getByRole("spinbutton", { name: "Hours" });
	await expect.element(input).toHaveValue(2.5);
	await expect.element(input).toHaveAttribute("min", "0");
	await expect.element(input).toHaveAttribute("max", "24");
	await expect.element(input).toHaveAttribute("step", "0.25");
});

test("starts empty without a value", async () => {
	render(NumberField, { field: fakeField("hours"), label: "Hours", value: null });

	await expect.element(page.getByRole("spinbutton", { name: "Hours" })).toHaveValue(null);
});

test("shows the field's issues", async () => {
	render(NumberField, { field: fakeField("hours", ["At most 24 hours"]), label: "Hours" });

	await expect.element(page.getByRole("alert")).toHaveTextContent("At most 24 hours");
});
