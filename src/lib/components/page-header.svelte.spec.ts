import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import PageHeader from "./page-header.svelte";

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

test("shows the title as the page's heading, with its description", async () => {
	render(PageHeader, { title: "Customers", description: "Everyone you work for." });

	await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Customers");
	await expect.element(page.getByText("Everyone you work for.")).toBeVisible();
});

test("leaves out the description when there is none", async () => {
	const { container } = await render(PageHeader, { title: "Customers" });

	expect(container.querySelector("p")).toBeNull();
});

test("puts breadcrumbs above the title, badges next to it and actions on the right", async () => {
	render(PageHeader, {
		title: "WO-2026-0042",
		children: html('<nav aria-label="Breadcrumb">Orders</nav>'),
		badges: html('<span data-testid="badge">Urgent</span>'),
		actions: html('<a href="/orders/WO-2026-0042/edit">Edit</a>'),
	});

	const heading = page.getByRole("heading", { level: 1 }).element();
	const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" }).element();
	const badge = page.getByTestId("badge").element();
	const edit = page.getByRole("link", { name: "Edit" }).element();

	expect(breadcrumbs.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(badge.parentElement).toBe(heading.parentElement);
	expect(heading.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
