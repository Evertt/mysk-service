import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import DetailItem from "./detail-item.svelte";

/** The term and its description, as rendered. */
const item = (container: HTMLElement) => ({
	term: container.querySelector("dt")?.textContent?.trim(),
	description: container.querySelector("dd")?.textContent?.trim(),
});

test("shows the label as the term and the value as its description", async () => {
	const { container } = await render(DetailItem, { label: "City", value: "Utrecht" });

	expect(item(container)).toEqual({ term: "City", description: "Utrecht" });
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test.each([null, undefined, ""])("shows a dash for a value of %j", async (value) => {
	const { container } = await render(DetailItem, { label: "Phone", value });

	expect(item(container)).toEqual({ term: "Phone", description: "—" });
});

test("links the value to href", async () => {
	render(DetailItem, { label: "Email", value: "jan@example.com", href: "mailto:jan@example.com" });

	await expect
		.element(page.getByRole("link", { name: "jan@example.com" }))
		.toHaveAttribute("href", "mailto:jan@example.com");
});

test("doesn't link a missing value", async () => {
	const { container } = await render(DetailItem, { label: "Email", value: null, href: "mailto:" });

	expect(item(container).description).toBe("—");
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("renders children instead of the value", async () => {
	const { container } = await render(DetailItem, {
		label: "Status",
		value: "ignored",
		children: createRawSnippet(() => ({ render: () => "<strong>Active</strong>" })),
	});

	expect(container.querySelector("dd strong")?.textContent).toBe("Active");
	expect(page.getByText("ignored").elements()).toHaveLength(0);
});
