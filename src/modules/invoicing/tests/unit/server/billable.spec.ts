import { expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";
import { billableItems } from "#modules/invoicing/api/extensions.ts";
import { offeredItems } from "#modules/invoicing/server/billable.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// Made-up modules instead of the ones in `src/modules`.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

test("billable items come from each module that is on and has any, by date", async () => {
	const period = { from: new Date(2026, 0, 1), until: new Date(2026, 9, 7) };
	const asked: unknown[] = [];
	const item = (reference: string, date: Date) => ({
		reference,
		description: reference,
		quantity: 1,
		unitPrice: 100,
		date,
	});
	registry.modules = [
		defineServerModule("fees" as ModuleId, [
			contribute(billableItems, async (input) => {
				asked.push(input);
				return [item("fees:2", new Date(2026, 8, 1)), item("fees:1", new Date(2026, 7, 1))];
			}),
		]),
		defineServerModule("nothing" as ModuleId, []),
		defineServerModule("rentals" as ModuleId, [
			contribute(billableItems, async () => [item("rentals:1", new Date(2026, 7, 15))]),
		]),
	];

	const items = await offeredItems(7, period, ["invoicing", "fees", "nothing", "rentals"]);
	expect(items.map((i) => i.reference)).toEqual(["fees:1", "rentals:1", "fees:2"]);
	expect(asked).toEqual([{ customerId: 7, period }]);
	expect(await offeredItems(7, period, ["invoicing", "nothing"])).toEqual([]);
	expect((await offeredItems(7, period, ["invoicing", "rentals"])).map((i) => i.reference)).toEqual(
		["rentals:1"],
	);
	// Not asked while invoicing, whose point it is, is off.
	expect(await offeredItems(7, period, ["fees", "rentals"])).toEqual([]);
});
