import type { SeedOrder } from "#lib/server/db/seed/module-seed.ts";
import { defineSeed } from "#lib/server/db/seed/module-seed.ts";
/**
 * The materials module's demo data (see `#lib/server/db/seed/module-seed.ts`): each tenant's
 * catalog with its stock, its orders' material lines and the stock ledger that adds up to it. The
 * catalog and the lines are drawn in the middle of the core's generation (`during`), where the core
 * drew them before materials were a module, so the demo data stays the same.
 */
import { toMoment } from "#lib/server/db/seed/temporal.ts";

import type { MaterialsDraft } from "../api/seed.ts";
import { material, orderLine, stockMovement } from "./schema.ts";
import { generateMaterials, generateOrderLines } from "./seed/catalog.ts";
import { generateShltrPartLines, generateShltrParts } from "./seed/shltr.ts";
import { generateStockMovements } from "./seed/stock.ts";

/** What the seed makes for a tenant: its materials and lines, and its orders (the draft's). */
interface MaterialsSeed extends MaterialsDraft {
	orders: SeedOrder[];
	/** The lines' total per order, worked out when first asked. */
	totals?: Map<number, number>;
}

const draftOf = (modules: Record<string, unknown>) => modules.materials as MaterialsDraft;

export default defineSeed<MaterialsSeed>({
	clear: async (tx) => {
		await tx.delete(stockMovement);
		await tx.delete(orderLine);
		await tx.delete(material);
	},

	during: {
		// Where the core used to make the catalog: after the equipment, before the orders.
		// SHLTR has its parts shop's instead (`./seed/shltr.ts`).
		afterEquipment({ faker, modules, profile }) {
			const materials = profile === "shltr" ? generateShltrParts(faker) : generateMaterials(faker);
			modules.materials = { materials, orderLines: [] };
		},
		// And the lines right after the orders.
		afterOrders({ faker, modules, orders, profile, equipments }) {
			const own = draftOf(modules);
			own.orderLines =
				profile === "shltr"
					? generateShltrPartLines(faker, orders, own.materials, equipments)
					: generateOrderLines(faker, orders, own.materials);
		},
	},

	// The draft's own arrays: a module that adds orders (contracts' call-outs) adds their lines to
	// them, whichever generates first.
	generate: (draft) => ({ ...draftOf(draft.modules), orders: draft.orders }),

	// Like `orders.costs`: an order's materials, also when it has none.
	costs(data, order) {
		data.totals ??= data.orderLines.reduce(
			(totals, line) =>
				totals.set(
					line.orderId,
					(totals.get(line.orderId) ?? 0) + Math.round(line.quantity * line.unitPrice),
				),
			new Map<number, number>(),
		);
		return [{ label: "Materialen", amount: data.totals.get(order.id) ?? 0 }];
	},

	async run({ tx, tenants, insertAll, count }) {
		// Ids are global, so each tenant's materials follow the ones before.
		let offset = 0;
		for (const tenant of tenants) {
			const { data } = tenant;
			const organizationId = tenant.id;
			const orderIdOf = (id: number) => tenant.orderIds[id - 1];
			const materials = data.materials.map((m) => ({ ...m, organizationId, id: m.id + offset }));
			const orderLines = data.orderLines.map((l) => ({
				...l,
				organizationId,
				orderId: orderIdOf(l.orderId),
				materialId: l.materialId + offset,
			}));
			const stockMovements = generateStockMovements(data, tenant.seed).map((m) => ({
				...m,
				organizationId,
				materialId: m.materialId + offset,
				orderId: m.orderId && orderIdOf(m.orderId),
				createdAt: toMoment(m.createdAt),
			}));
			await insertAll(materials, (chunk) => tx.insert(material).values(chunk));
			await insertAll(orderLines, (chunk) => tx.insert(orderLine).values(chunk));
			await insertAll(stockMovements, (chunk) => tx.insert(stockMovement).values(chunk));
			count("materials", materials);
			count("orderLines", orderLines);
			count("stockMovements", stockMovements);
			offset += materials.length;
		}
	},
});
