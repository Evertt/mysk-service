import { expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import RowActions from "./row-actions.svelte";

test("the menu is named after the row and has its open and edit links", async () => {
	render(RowActions, {
		label: "Acme B.V.",
		href: "/customers/C-0001",
		editHref: "/customers/C-0001/edit",
	});

	await page.getByRole("button", { name: "Actions for Acme B.V." }).click();

	await expect.element(page.getByRole("menu").getByText("Acme B.V.")).toBeVisible();
	await expect
		.element(page.getByRole("menuitem", { name: "Open" }))
		.toHaveAttribute("href", "/customers/C-0001");
	await expect
		.element(page.getByRole("menuitem", { name: "Edit" }))
		.toHaveAttribute("href", "/customers/C-0001/edit");
});

test("leaves out the links it isn't given", async () => {
	render(RowActions, { label: "Acme B.V.", copy: [{ label: "Copy code", value: "C-0001" }] });

	await page.getByRole("button", { name: "Actions for Acme B.V." }).click();

	await expect.element(page.getByRole("menuitem", { name: "Copy code" })).toBeVisible();
	expect(page.getByRole("menuitem").elements()).toHaveLength(1);
});

test("a copy action puts its value on the clipboard", async () => {
	const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
	render(RowActions, {
		label: "Acme B.V.",
		copy: [
			{ label: "Copy customer code", value: "C-0001" },
			{ label: "Copy email", value: "info@acme.example" },
		],
	});

	await page.getByRole("button", { name: "Actions for Acme B.V." }).click();
	await page.getByRole("menuitem", { name: "Copy email" }).click();

	expect(writeText).toHaveBeenCalledWith("info@acme.example");
	writeText.mockRestore();
});

test("reached with the keyboard, the button keeps the focus and opens the menu", async () => {
	render(RowActions, { label: "Acme B.V.", href: "/customers/C-0001" });
	const button = page.getByRole("button", { name: "Actions for Acme B.V." });

	const plain = button.element() as HTMLElement;
	plain.focus();
	// The menu's own trigger takes the plain button's place, with the focus.
	await expect.poll(() => button.element()).not.toBe(plain);
	await expect.element(button).toHaveFocus();

	await userEvent.keyboard("{Enter}");
	await expect.element(page.getByRole("menuitem", { name: "Open" })).toBeVisible();
});

test("a tap on the button before the menu is set up opens it", async () => {
	render(RowActions, { label: "Acme B.V.", href: "/customers/C-0001" });

	// A click without the pointer coming over it first, as a tap can be.
	(page.getByRole("button", { name: "Actions for Acme B.V." }).element() as HTMLElement).click();

	await expect.element(page.getByRole("menuitem", { name: "Open" })).toBeVisible();
});
