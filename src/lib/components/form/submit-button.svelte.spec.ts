import PencilIcon from "@lucide/svelte/icons/pencil";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import SubmitButton from "./submit-button.svelte";

const text = (label: string) => createRawSnippet(() => ({ render: () => `<span>${label}</span>` }));

test("is a submit button with its label", async () => {
	render(SubmitButton, { children: text("Save") });

	await expect
		.element(page.getByRole("button", { name: "Save" }))
		.toHaveAttribute("type", "submit");
	await expect.element(page.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("shows its icon until the form is pending, then a spinner in its place", async () => {
	const { container, rerender } = await render(SubmitButton, {
		icon: PencilIcon,
		pending: false,
		children: text("Save"),
	});

	expect(container.querySelectorAll("svg")).toHaveLength(1);
	expect(container.querySelector("svg")).toHaveAttribute("data-icon", "inline-start");
	expect(page.getByRole("status").elements()).toHaveLength(0);

	await rerender({ pending: 1 });

	// The spinner is part of the button's name.
	const submit = page.getByRole("button", { name: "Loading Save" });
	await expect.element(submit).toBeDisabled();
	await expect.element(submit.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	expect(container.querySelectorAll("svg")).toHaveLength(1);
	expect(container.querySelector("svg.lucide-pencil")).toBeNull();
});

test("stays disabled when asked to, and passes other props to the button", async () => {
	render(SubmitButton, {
		disabled: true,
		variant: "destructive",
		class: "w-full",
		children: text("Delete"),
	});

	const button = page.getByRole("button", { name: "Delete" });
	await expect.element(button).toBeDisabled();
	await expect.element(button).toHaveClass("w-full", "text-destructive");
});
