import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import Callout from "#lib/components/callout.svelte";
import KeyFigure from "#lib/components/key-figure.svelte";

test("a warning: amber, its icon, title, text and actions, and the attributes it's given", async () => {
	const { container } = await render(Callout, {
		tone: "warning",
		icon: TriangleAlertIcon,
		title: "3 products run low",
		role: "status",
		children: createRawSnippet(() => ({ render: () => "<span>Order in time</span>" })),
		actions: createRawSnippet(() => ({ render: () => '<a href="/stock">Stock</a>' })),
	});

	const callout = page.getByRole("status");
	await expect.element(callout).toHaveClass("bg-amber-50/60");
	await expect.element(callout.getByText("3 products run low")).toBeVisible();
	await expect.element(callout.getByText("Order in time")).toBeVisible();
	await expect.element(callout.getByRole("link", { name: "Stock" })).toBeVisible();
	expect(container.querySelector("[data-callout]")?.getAttribute("data-callout")).toBe("warning");
});

test("a key figure: its label and value, in a list's terms", async () => {
	const { container } = await render(KeyFigure, {
		label: "Partner revenue",
		children: createRawSnippet(() => ({ render: () => "<span data-revenue>€200,000</span>" })),
	});

	expect(container.querySelector("dt")?.textContent).toBe("Partner revenue");
	expect(container.querySelector("dd [data-revenue]")?.textContent).toBe("€200,000");
	expect(container.querySelector("[data-key-figure]")?.getAttribute("class")).toContain(
		"border-primary",
	);
});
