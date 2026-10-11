// The server half of `extension-slot.svelte.spec.ts`: what a page's HTML has when a module's part
// fails while it's server-rendered.
import { render } from "svelte/server";
import { expect, test, vi } from "vite-plus/test";

import { detailSide } from "#lib/orders/extensions.ts";
import ExtensionSlot from "#routes/(app)/extension-slot.svelte";

// The same made-up modules as in the component test: gadgets' card renders, gizmos' component
// doesn't load and widgets' card fails on its data (see there for the others).
vi.mock("#lib/modules/manifests.gen.ts", async () => {
	const { gadgets, gizmos, widgets } = await import("#unit/lib/modules/fakes.ts");
	return { manifests: [gadgets, gizmos, widgets] };
});
vi.mock("#lib/extensions/contributions.gen.ts", async () => {
	const { slotContribution } = await import("#lib/extensions/define.ts");
	const { detailSide } = await import("#lib/orders/extensions.ts");
	const { gadgets, gizmosOrderCard, widgets } = await import("#unit/lib/modules/fakes.ts");
	return {
		slotContributions: [
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
		],
		bulkContributions: [],
	};
});

vi.mock("#lib/auth/session.remote.ts", () => ({
	getCurrentTenant: vi.fn(() => Promise.resolve({ modules: ["gadgets", "gizmos", "widgets"] })),
}));

const props = { point: detailSide, props: { number: "ORD-0001" } };

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
});

test("without a transformError, the page fails as a whole (SvelteKit always passes one)", async () => {
	await expect(render(ExtensionSlot, { props })).rejects.toThrow();
});
