// The server half of `module-slots.svelte.spec.ts`: what a page's HTML has when a module's part
// fails while it's server-rendered.
import { render } from "svelte/server";
import { expect, test, vi } from "vite-plus/test";

import ModuleSlots from "./module-slots.svelte";

// The same made-up modules as in the component test: gadgets' card renders, gizmos' component
// doesn't load and widgets' card fails on its data.
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

vi.mock("./session.remote.ts", () => ({
	getCurrentTenant: vi.fn(() => Promise.resolve({ modules: ["gadgets", "gizmos", "widgets"] })),
}));

const props = { name: "order" as const, props: { number: "ORD-0001" } };

test("a failed part renders its notice in the page's HTML, ready to hydrate", async () => {
	// SvelteKit passes the errors that boundaries catch through `handleError` like this.
	const transformError = vi.fn(() => ({ status: 500, message: "Internal Error" }));

	const { body } = await render(ModuleSlots, { props, transformError });

	expect(body).toContain("Gadgets for ORD-0001");
	expect(body).toContain("Couldn't load what Gizmos adds here.");
	expect(body).toContain("Couldn't load what Widgets adds here.");
	expect(body).not.toContain("Widgets for ORD-0001");
	// The error goes with the failed part, for the browser to hydrate its notice.
	expect(body).toContain('<!--[?{"status":500,"message":"Internal Error"}-->');
	expect(transformError).toHaveBeenCalledTimes(2);
});

test("without a transformError, the page fails as a whole (SvelteKit always passes one)", async () => {
	await expect(render(ModuleSlots, { props })).rejects.toThrow();
});
