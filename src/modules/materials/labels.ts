/** The translated names of the materials module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { MaterialUnit, StockLevel, StockMovementKind } from "./model.ts";

export const materialLabels = defineLabels({
	materialUnit: {
		pcs: m.materials_unit_pcs,
		m: m.materials_unit_m,
		kg: m.materials_unit_kg,
		l: m.materials_unit_l,
	} satisfies Labels<MaterialUnit>,
	materialUnitSymbol: {
		pcs: m.materials_unit_symbol_pcs,
		m: m.materials_unit_symbol_m,
		kg: m.materials_unit_symbol_kg,
		l: m.materials_unit_symbol_l,
	} satisfies Labels<MaterialUnit>,
	stockLevel: {
		out: m.materials_stock_level_out,
		low: m.materials_stock_level_low,
		in_stock: m.materials_stock_level_in_stock,
	} satisfies Labels<StockLevel>,
	stockMovementKind: {
		opening_balance: m.materials_movement_kind_opening_balance,
		receipt: m.materials_movement_kind_receipt,
		adjustment: m.materials_movement_kind_adjustment,
		consumption: m.materials_movement_kind_consumption,
		return: m.materials_movement_kind_return,
	} satisfies Labels<StockMovementKind>,
});
