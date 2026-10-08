import { expect, test, vi } from "vite-plus/test";

import { orderCommitted } from "#lib/server/modules.ts";

import invoicing from "./index.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// The core, without the modules in `src/modules`.
vi.mock("#lib/server/modules.gen.ts", () => ({ generatedServerModules: () => [] }));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("../invoicing.remote.ts", () => ({
	getOrderInvoice: (number: string) => ({ refresh: async () => void refreshed.push(number) }),
}));

test("the invoicing module refreshes the invoice card of a saved order", async () => {
	orderCommitted({ number: "ORD-2026-00003" }, [invoicing]);
	await new Promise((resolve) => setTimeout(resolve));
	expect(refreshed).toEqual(["ORD-2026-00003"]);
});
