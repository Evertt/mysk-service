import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import StatCard from "#lib/components/stat-card.svelte";

test("shows the label above the value, and the detail below", async () => {
	render(StatCard, { label: "Open orders", value: "12", detail: "3 without an engineer" });

	const label = page.getByText("Open orders").element();
	const value = page.getByText("12").element();
	const detail = page.getByText("3 without an engineer").element();

	expect(label.compareDocumentPosition(value)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(value.compareDocumentPosition(detail)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	await expect.element(page.getByText("12")).toHaveClass("text-3xl", "tabular-nums");
});

test("leaves out the footer when there is no detail", async () => {
	const { container } = await render(StatCard, { label: "Orders", value: "1" });

	expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
});

test("shows a smaller value for the small size", async () => {
	render(StatCard, { label: "Orders", value: "1", size: "small" });

	await expect.element(page.getByText("1", { exact: true })).toHaveClass("text-2xl");
	await expect.element(page.getByText("1", { exact: true })).not.toHaveClass("text-3xl");
});

test("renders the action next to the value", async () => {
	render(StatCard, {
		label: "Low stock",
		value: "4",
		action: createRawSnippet(() => ({ render: () => '<a href="/materials">View</a>' })),
	});

	await expect
		.element(page.getByRole("link", { name: "View" }))
		.toHaveAttribute("href", "/materials");
});
