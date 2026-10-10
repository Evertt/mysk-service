import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { detailSide } from "#lib/orders/extensions.ts";

import { data } from "./extension-slot.failing.test-harness.svelte";
import ExtensionSlot from "./extension-slot.svelte";

// Made-up modules on an order's page: gadgets' card renders, gizmos' component doesn't load and
// widgets' card fails on its data (until `data.fails` is cleared). Dormant's card is of a module
// the tenant doesn't have, and gadgets has one more at the dashboard, a point of another slot.
vi.mock("#lib/modules/manifests.gen.ts", async () => {
	const { dormant, gadgets, gizmos, widgets } = await import("#lib/modules/fakes.ts");
	return { manifests: [gadgets, gizmos, widgets, dormant] };
});
vi.mock("#lib/extensions/contributions.gen.ts", async () => {
	const { slotContribution } = await import("#lib/extensions/define.ts");
	const { detailSide } = await import("#lib/orders/extensions.ts");
	const { dormant, fakeSlotContributions, gadgets, gizmosOrderCard, widgets } =
		await import("#lib/modules/fakes.ts");
	return {
		slotContributions: [
			fakeSlotContributions[0],
			slotContribution(
				detailSide,
				gadgets.id,
				"card",
				() => import("./extension-slot.test-harness.svelte"),
			),
			gizmosOrderCard,
			slotContribution(
				detailSide,
				widgets.id,
				"card",
				() => import("./extension-slot.failing.test-harness.svelte"),
			),
			slotContribution(
				detailSide,
				dormant.id,
				"card",
				() => import("./extension-slot.test-harness.svelte"),
			),
		],
		bulkContributions: [],
	};
});

// The tenant has all but the dormant module; the remote query reads it from the session on the server.
vi.mock("#lib/auth/session.remote.ts", () => ({
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
	render(ExtensionSlot, { props: { point: detailSide, props: { number: "ORD-0001" } } });

const failedCard = (id: string) =>
	page.elementLocator(document.querySelector(`[data-extension-failed="${id}"]`)!);

test("a module's part that fails doesn't keep the others from rendering", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Gadgets for ORD-0001")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Gizmos adds here.")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	expect(page.getByText("Widgets for ORD-0001").elements()).toHaveLength(0);
});

test("only the contributions of the modules the tenant has, to this slot, render", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Gadgets for ORD-0001")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	// Dormant's card would show the same text as gadgets', and gadgets' card at the dashboard
	// would fail (its component is not one), as a notice.
	expect(page.getByText("Gadgets for ORD-0001").elements()).toHaveLength(1);
	expect(document.querySelectorAll("[data-extension-failed]")).toHaveLength(2);
});

test("a failed part is logged with its contribution", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	expect(logged).toHaveBeenCalledWith(
		"The gizmos/orders.detail.side/card contribution failed",
		expect.objectContaining({ message: "Failed to fetch dynamically imported module" }),
	);
	expect(logged).toHaveBeenCalledWith(
		"The widgets/orders.detail.side/card contribution failed",
		expect.objectContaining({ message: "The query failed" }),
	);
});

test("trying again renders the part once it works", async () => {
	renderOrderSlot();

	await expect.element(page.getByText("Couldn't load what Widgets adds here.")).toBeVisible();
	data.fails = false;
	await failedCard("widgets/orders.detail.side/card")
		.getByRole("button", { name: "Try again" })
		.click();

	await expect.element(page.getByText("Widgets for ORD-0001")).toBeVisible();
	expect(page.getByText("Couldn't load what Widgets adds here.").elements()).toHaveLength(0);
	// The other modules' parts are as they were.
	await expect.element(page.getByText("Gadgets for ORD-0001")).toBeVisible();
	await expect.element(page.getByText("Couldn't load what Gizmos adds here.")).toBeVisible();
});
