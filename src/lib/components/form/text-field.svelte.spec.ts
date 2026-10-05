import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { fakeField } from "./fake-form.js";
import TextField from "./text-field.svelte";

test("the label names an input for the field, filled with the initial value", async () => {
	render(TextField, { field: fakeField("name"), label: "Name", value: "Acme B.V." });

	const input = page.getByRole("textbox", { name: "Name" });
	await expect.element(input).toHaveValue("Acme B.V.");
	await expect.element(input).toHaveAttribute("name", "name");
	await expect.element(input).not.toHaveAttribute("aria-invalid");
});

test("starts empty without a value", async () => {
	render(TextField, { field: fakeField("name"), label: "Name", value: null });

	await expect.element(page.getByRole("textbox", { name: "Name" })).toHaveValue("");
});

test("takes the input type, placeholder and autocomplete", async () => {
	render(TextField, {
		field: fakeField("email"),
		label: "Email",
		type: "email",
		placeholder: "name@example.com",
		autocomplete: "email",
	});

	const input = page.getByRole("textbox", { name: "Email" });
	await expect.element(input).toHaveAttribute("type", "email");
	await expect.element(input).toHaveAttribute("placeholder", "name@example.com");
	await expect.element(input).toHaveAttribute("autocomplete", "email");
});

test("multiline fields are a textarea", async () => {
	render(TextField, { field: fakeField("notes"), label: "Notes", multiline: true, value: "Hi" });

	const textarea = page.getByRole("textbox", { name: "Notes" });
	await expect.element(textarea).toHaveValue("Hi");
	expect(textarea.element().tagName).toBe("TEXTAREA");
});

test("shows the description", async () => {
	render(TextField, {
		field: fakeField("phone"),
		label: "Phone",
		description: "Including the country code.",
	});

	await expect.element(page.getByText("Including the country code.")).toBeVisible();
});

test("an issue marks the field invalid and is shown below it", async () => {
	render(TextField, { field: fakeField("name", ["Name is required"]), label: "Name" });

	await expect
		.element(page.getByRole("textbox", { name: "Name" }))
		.toHaveAttribute("aria-invalid", "true");
	await expect.element(page.getByRole("group")).toHaveAttribute("data-invalid", "true");
	await expect.element(page.getByRole("alert")).toHaveTextContent("Name is required");
});

test("several issues are listed", async () => {
	render(TextField, {
		field: fakeField("code", ["Code is too short", "Code may only contain letters"]),
		label: "Code",
	});

	const items = page.getByRole("alert").getByRole("listitem");
	await expect.element(items.first()).toHaveTextContent("Code is too short");
	await expect.element(items.last()).toHaveTextContent("Code may only contain letters");
});

test("without issues there is no error", async () => {
	render(TextField, { field: fakeField("name"), label: "Name" });

	await expect.element(page.getByRole("textbox", { name: "Name" })).toBeVisible();
	expect(page.getByRole("alert").elements()).toHaveLength(0);
	await expect.element(page.getByRole("group")).not.toHaveAttribute("data-invalid");
});
