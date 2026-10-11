import { expect, test, vi } from "vite-plus/test";

import { committed } from "#lib/orders/extensions.ts";
import { emit, type ServerModule } from "#lib/server/extensions.ts";
import invoicing from "#modules/invoicing/server/index.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// The registry has only this module.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("#modules/invoicing/invoicing.remote.ts", () => ({
	getOrderInvoice: (number: string) => ({ refresh: async () => void refreshed.push(number) }),
}));

test("the invoicing module refreshes the invoice card of a saved order", async () => {
	registry.modules = [invoicing];
	emit(committed, { number: "ORD-2026-00003" }, ["invoicing"]);
	await new Promise((resolve) => setTimeout(resolve));
	expect(refreshed).toEqual(["ORD-2026-00003"]);
});
