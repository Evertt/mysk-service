import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { data } from "./module-slots.failing.test-harness.svelte";
import ModuleSlots from "./module-slots.svelte";

// Made-up modules on an order's page: gadgets' card renders, gizmos' component doesn't load and
// widgets' card fails on its data (until `data.fails` is cleared).
vi.mock("#lib/modules/manifests.gen.ts", async () => {
	const { gadgets, gizmos, widgets } = await import("#lib/modules/fakes.ts");
	return { manifests: [gadgets, gizmos, widgets] };
});
vi.mock("#lib/extensions/contributions.gen.ts", async () => {
	const { slotContribution } = await import("#lib/extensions/define.ts");
	const { detailSide } = await import("#lib/orders/extensions.ts");
	const { gadgets, gizmosOrderCard, widgets } = await import("#lib/modules/fakes.ts");
	return {
		slotContributions: [
			slotContribution(
				detailSide,
				gadgets.id,
				"card",
				() => import("./module-slots.test-harness.svelte"),
			),
			gizmosOrderCard,
			slotContribution(
				detailSide,
				widgets.id,
				"card",
				() => import("./module-slots.failing.test-harness.svelte"),
			),
		],
		bulkContributions: [],
	};
});

// The tenant has all three; the remote query reads it from the session on the server.
vi.mock("./session.remote.ts", () => ({
	getCurrentTenant: vi.fn(() => Promise.resolve({ modules: ["gadgets", "gizmos", "widgets"] })),
}));

const logged = vi.spyOn(console, "error");

beforeEach(() => {
	data.fails = true;
	logged.mockImplementation(() => {});
});

afterEach(() => {
	logged.mockReset();
});

// Under `props`: the component's own `props` prop would be read as the options' `props`.
const renderOrderSlot = () =>
	render(ModuleSlots, { props: { name: "order", props: { number: "ORD-0001" } } });

const failedCard = (id: string) =>
	page.elementLocator(document.querySelector(`[data-module-slot-failed="${id}"]`)!);

test("a module's part that fails doesn't keep the others from rendering", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Gadgets for ORD-0001")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Gizmos adds here.")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	expect(page.getByText("Widgets for ORD-0001").elements()).toHaveLength(0);
});

test("a failed part is logged with its module and slot", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	expect(logged).toHaveBeenCalledWith(
		"The gizmos module's part of the order slot failed",
		expect.objectContaining({ message: "Failed to fetch dynamically imported module" }),
	);
	expect(logged).toHaveBeenCalledWith(
		"The widgets module's part of the order slot failed",
		expect.objectContaining({ message: "The query failed" }),
	);
});

test("trying again renders the part once it works", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	data.fails = false;
	await failedCard("widgets").getByRole("button", { name: "Try again" }).click();

	await expect.element(page.getByText("Widgets for ORD-0001")).toBeVisible();
	expect(page.getByText("Couldn't load what Widgets adds here.").elements()).toHaveLength(0);
	// The other modules' parts are as they were.
	await expect.element(page.getByText("Gadgets for ORD-0001")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Gizmos adds here.")).toBeVisible();
});
