import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import TwoLineCell from "./two-line-cell.svelte";

test("the primary value links to href, with the detail line below it", async () => {
	render(TwoLineCell, { primary: "Acme B.V.", secondary: "C-0001", href: "/customers/C-0001" });

	await expect
		.element(page.getByRole("link", { name: "Acme B.V." }))
		.toHaveAttribute("href", "/customers/C-0001");
	await expect.element(page.getByText("C-0001")).toBeInTheDocument();
});

test("without href the primary value is plain text", async () => {
	render(TwoLineCell, { primary: "Jan de Vries", secondary: "jan@example.com" });

	await expect.element(page.getByText("Jan de Vries")).toBeInTheDocument();
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("the detail line is left out when there is none", async () => {
	const { container } = await render(TwoLineCell, { primary: "Amsterdam", secondary: null });

	await expect.element(page.getByText("Amsterdam")).toBeInTheDocument();
	expect(container.querySelectorAll("span")).toHaveLength(1);
});

test("without a primary value the fallback is shown, even with a detail line", async () => {
	render(TwoLineCell, { primary: null, secondary: "C-0001", href: "/customers/C-0001" });

	await expect.element(page.getByText("—")).toBeInTheDocument();
	expect(page.getByText("C-0001").elements()).toHaveLength(0);
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("the fallback can be customised", async () => {
	render(TwoLineCell, { fallback: "No contact" });

	await expect.element(page.getByText("No contact")).toHaveClass("text-muted-foreground");
});
