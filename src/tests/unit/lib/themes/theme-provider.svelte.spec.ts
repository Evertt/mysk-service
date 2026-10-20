import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { buttonVariants } from "#lib/components/ui/button/index.ts";

import Harness from "./theme-provider.test-harness.svelte";

const button = () => page.getByRole("button", { name: "Save" });

test("a theme without component styles leaves the components as shadcn made them", async () => {
	render(Harness, { name: "neutral", variant: "outline", size: "sm" });

	await expect
		.element(button())
		.toHaveAttribute("class", buttonVariants({ variant: "outline", size: "sm" }));
});

test("a theme adds its classes for the part and for the props' values", async () => {
	render(Harness, { name: "brutalist", variant: "secondary" });

	// `base`, then `variant.secondary`.
	await expect.element(button()).toHaveClass("border-2", "border-foreground", "uppercase");
	await expect.element(button()).toHaveClass("bg-secondary", "hover:bg-secondary");
	await expect.element(button()).not.toHaveClass("bg-primary");
});

test("a theme's classes win conflicts with the component's own", async () => {
	render(Harness, { name: "brutalist" });

	// shadcn's button has `border border-transparent`, brutalist's `border-2 border-foreground`.
	await expect.element(button()).toHaveClass("border-2", "border-foreground");
	await expect.element(button()).not.toHaveClass("border");
	await expect.element(button()).not.toHaveClass("border-transparent");
});

test("a class passed to the component wins conflicts with the theme's", async () => {
	render(Harness, { name: "brutalist", class: "normal-case border-4" });

	await expect.element(button()).toHaveClass("normal-case", "border-4", "border-foreground");
	await expect.element(button()).not.toHaveClass("uppercase");
	await expect.element(button()).not.toHaveClass("border-2");
});

test("the theme styles every themed part inside it", async () => {
	render(Harness, { name: "brutalist", badgeVariant: "ghost" });

	const badge = page.getByText("New");
	await expect.element(badge).toHaveClass("border-2", "font-bold", "border-dashed");
});

test("a theme colours a badge's tone its own way", async () => {
	render(Harness, { name: "lagoon", badgeVariant: "success" });

	const badge = page.getByText("New");
	await expect.element(badge).toHaveClass("border-success/25", "bg-success/8", "text-success");
	await expect.element(badge).not.toHaveClass("bg-success/10");
});

test("switching themes restyles the components", async () => {
	const { rerender } = await render(Harness, { name: "brutalist" });
	await expect.element(button()).toHaveClass("uppercase");

	await rerender({ name: "harbor" });

	await expect.element(button()).not.toHaveClass("uppercase");
	await expect.element(button()).toHaveClass("font-medium", "shadow-sm");
});

test("sets the theme and mode on the document, with the dark class in dark mode", async () => {
	const { rerender } = await render(Harness, { name: "harbor", mode: "dark" });

	const root = document.documentElement;
	await expect.poll(() => root.dataset.theme).toBe("harbor");
	expect(root.dataset.mode).toBe("dark");
	expect(root.classList.contains("dark")).toBe(true);

	await rerender({ name: "sorbet", mode: "light" });

	await expect.poll(() => root.dataset.theme).toBe("sorbet");
	expect(root.dataset.mode).toBe("light");
	expect(root.classList.contains("dark")).toBe(false);
});

test("adds every theme's variables to the page", async () => {
	render(Harness, { name: "neutral" });

	await expect
		.poll(() => [...document.head.querySelectorAll("style")].map((style) => style.textContent))
		.toContainEqual(expect.stringContaining(':root[data-theme="brutalist"]'));
});
