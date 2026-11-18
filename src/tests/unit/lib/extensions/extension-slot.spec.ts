// The server half of `extension-slot.svelte.spec.ts`: what a page's HTML has when a module's part
// fails while it's server-rendered.
import { render } from "svelte/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
import { points } from "#lib/orders/extensions.ts";

// The same made-up modules as in the component test: gadgets' card renders, gizmos' component
// doesn't load and widgets' card fails on its data (see there for the others).
vi.mock("#lib/modules/manifests.gen.ts", async () => {
	const { gadgets, gizmos, widgets } = await import("#unit/lib/modules/fakes.ts");
	return { manifests: [gadgets, gizmos, widgets] };
});
vi.mock("#lib/extensions/contributions.gen.ts", async () => {
	const { slotContribution } = await import("#lib/extensions/define.ts");
	const { points } = await import("#lib/orders/extensions.ts");
	const { gadgets, gizmosOrderCard, widgets } = await import("#unit/lib/modules/fakes.ts");
	return {
		slotContributions: [
			slotContribution(
				points.detail.side,
				gadgets.id,
				"card",
				() => import("./extension-slot.test-harness.svelte"),
			),
			gizmosOrderCard,
			slotContribution(
				points.detail.side,
				widgets.id,
				"card",
				() => import("./extension-slot.failing.test-harness.svelte"),
			),
		],
		bulkContributions: [],
	};
});

vi.mock("#lib/auth/session.remote.ts", () => ({
	getTenantModules: vi.fn(() => Promise.resolve(["gadgets", "gizmos", "widgets"])),
}));

const props = { point: points.detail.side, props: { number: "ORD-0001" } };

// Gizmos' component not loading is logged; it's on purpose here.
const logged = vi.spyOn(console, "error");
beforeEach(() => {
	logged.mockImplementation(() => {});
});
afterEach(() => {
	logged.mockReset();
});

/** Whether the slot logged that gizmos' contribution didn't load. */
const loggedGizmos = () =>
	expect(logged).toHaveBeenCalledWith(
		"The contribution gizmos/orders.detail.side/card didn't load.",
		expect.any(Error),
	);

test("a failed part renders its notice in the page's HTML, ready to hydrate", async () => {
	// SvelteKit passes the errors that boundaries catch through `handleError` like this.
	const transformError = vi.fn(() => ({ status: 500, message: "Internal Error" }));

	const { body } = await render(ExtensionSlot, { props, transformError });

	expect(body).toContain("Gadgets for ORD-0001");
	expect(body).toContain("Couldn't load what Gizmos adds here.");
	expect(body).toContain("Couldn't load what Widgets adds here.");
	expect(body).not.toContain("Widgets for ORD-0001");
	// The error goes with the failed part, for the browser to hydrate its notice.
	expect(body).toContain('<!--[?{"status":500,"message":"Internal Error"}-->');
	expect(transformError).toHaveBeenCalledTimes(2);
	loggedGizmos();
});

test("without a transformError, the page fails as a whole (SvelteKit always passes one)", async () => {
	await expect(render(ExtensionSlot, { props })).rejects.toThrow();
	loggedGizmos();
});
