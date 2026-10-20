import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import Callout from "#lib/components/callout.svelte";

test("a warning: in the warning tone, its icon, title, text and actions, and the attributes it's given", async () => {
	const { container } = await render(Callout, {
		tone: "warning",
		icon: TriangleAlertIcon,
		title: "3 products run low",
		role: "status",
		children: createRawSnippet(() => ({ render: () => "<span>Order in time</span>" })),
		actions: createRawSnippet(() => ({ render: () => '<a href="/stock">Stock</a>' })),
	});

	const callout = page.getByRole("status");
	await expect.element(callout).toHaveClass("bg-warning/10");
	await expect.element(callout.getByText("3 products run low")).toBeVisible();
	await expect.element(callout.getByText("Order in time")).toBeVisible();
	await expect.element(callout.getByRole("link", { name: "Stock" })).toBeVisible();
	expect(container.querySelector("[data-callout]")?.getAttribute("data-callout")).toBe("warning");
});

test.each([
	["success", "bg-success/10", "text-success"],
	["danger", "bg-destructive/10", "text-destructive"],
] as const)(
	"a %s notice is tinted in its tone, its icon in the tone's colour",
	async (tone, box, icon) => {
		const { container } = await render(Callout, { tone, icon: TriangleAlertIcon, title: "Done" });

		const callout = container.querySelector(`[data-callout="${tone}"]`);
		expect(callout?.getAttribute("class")).toContain(box);
		expect(callout?.querySelector("svg")?.getAttribute("class")).toContain(icon);
	},
);
