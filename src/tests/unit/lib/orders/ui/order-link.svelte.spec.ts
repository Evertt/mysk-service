import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import OrderLink from "#lib/orders/ui/order-link.svelte";

test("links the order number to the order's page", async () => {
	render(OrderLink, { number: "WO-2026-0042" });

	await expect
		.element(page.getByRole("link", { name: "WO-2026-0042" }))
		.toHaveAttribute("href", "/orders/WO-2026-0042");
});
