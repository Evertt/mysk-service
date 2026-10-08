import { expect, test, vi } from "vite-plus/test";

import { orderCommitted } from "#lib/server/modules.ts";

import contracts from "./index.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.js", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// The core still loads invoicing's server hooks, which bring its remote functions along.
vi.mock("#lib/components/invoicing/invoicing.remote.js", () => ({}));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("../coverage.remote.js", () => ({
	getOrderCoverage: (number: string) => ({ refresh: async () => void refreshed.push(number) }),
}));

test("the contracts module refreshes the order's coverage once the order is saved", async () => {
	orderCommitted({ number: "ORD-2026-00002" }, [contracts]);
	await new Promise((resolve) => setTimeout(resolve));
	expect(refreshed).toEqual(["ORD-2026-00002"]);
});
