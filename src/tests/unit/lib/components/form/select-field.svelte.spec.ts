import { expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import SelectField from "#lib/components/form/select-field.svelte";

import { fakeField } from "./fake-form.ts";

const options = [
	{ value: "pcs", label: "Pieces" },
	{ value: "m", label: "Metres" },
];

const optionLabels = (select: HTMLSelectElement) =>
	[...select.options].map((option) => option.textContent?.trim());

test("a select with the options and the initial value selected", async () => {
	render(SelectField, { field: fakeField("unit"), label: "Unit", options, value: "m" });

	const select = page.getByRole("combobox", { name: "Unit" });
	await expect.element(select).toHaveValue("m");
	await expect.element(select).toHaveAttribute("name", "unit");
	expect(optionLabels(select.element() as HTMLSelectElement)).toEqual(["Pieces", "Metres"]);
});

test("a placeholder adds an empty first option, selected without a value", async () => {
	render(SelectField, {
		field: fakeField("unit"),
		label: "Unit",
		options,
		placeholder: "No unit",
		value: null,
	});

	const select = page.getByRole("combobox", { name: "Unit" });
	await expect.element(select).toHaveValue("");
	expect(optionLabels(select.element() as HTMLSelectElement)).toEqual([
		"No unit",
		"Pieces",
		"Metres",
	]);
});

test("options with a group are shown under its heading, the others outside any group", async () => {
	render(SelectField, {
		field: fakeField("equipmentId"),
		label: "Equipment",
		options: [
			{ value: "", label: "None" },
			{ value: "1", label: "SN-001", group: "Generators" },
			{ value: "2", label: "SN-002", group: "Chillers" },
			{ value: "3", label: "SN-003", group: "Generators" },
		],
	});

	const select = page.getByRole("combobox", { name: "Equipment" }).element();
	const groups = [...select.querySelectorAll("optgroup")].map((group) => ({
		label: group.label,
		options: [...group.querySelectorAll("option")].map((option) => option.textContent?.trim()),
	}));
	expect(groups).toEqual([
		{ label: "Generators", options: ["SN-001", "SN-003"] },
		{ label: "Chillers", options: ["SN-002"] },
	]);
	expect(select.querySelector(":scope > option")?.textContent?.trim()).toBe("None");
});

test("reports the chosen value", async () => {
	const onchange = vi.fn();
	render(SelectField, { field: fakeField("unit"), label: "Unit", options, value: "pcs", onchange });

	await page.getByRole("combobox", { name: "Unit" }).selectOptions("Metres");

	expect(onchange).toHaveBeenCalledWith("m");
});

test("shows the field's issues", async () => {
	render(SelectField, { field: fakeField("unit", ["Choose a unit"]), label: "Unit", options });

	await expect
		.element(page.getByRole("combobox", { name: "Unit" }))
		.toHaveAttribute("aria-invalid", "true");
	await expect.element(page.getByRole("alert")).toHaveTextContent("Choose a unit");
});
