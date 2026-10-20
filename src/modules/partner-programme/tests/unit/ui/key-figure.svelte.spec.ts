import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import KeyFigure from "#modules/partner-programme/ui/key-figure.svelte";

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
