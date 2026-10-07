import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.js";

import OrderTags from "./order-tags.svelte";

test("shows each tag as a badge in its tone, with its detail on hover", async () => {
	render(OrderTags, {
		tags: [
			{ label: "SLA overdue", tone: "danger", detail: "Respond by 7 Oct 2026, 12:00" },
			{ label: "SLA at risk", tone: "warning" },
		],
	});

	const overdue = page.getByText("SLA overdue");
	await expect
		.element(overdue)
		.toHaveClass(...badgeVariants({ variant: "destructive" }).split(" "));
	await expect.element(overdue).toHaveAttribute("title", "Respond by 7 Oct 2026, 12:00");
	const atRisk = page.getByText("SLA at risk");
	await expect.element(atRisk).toHaveClass(...badgeVariants({ variant: "secondary" }).split(" "));
	await expect.element(atRisk).not.toHaveAttribute("title");
});

test("shows nothing without tags", async () => {
	const { container } = render(OrderTags, { tags: [] });
	expect(container.querySelector('[data-slot="badge"]')).toBeNull();
});
