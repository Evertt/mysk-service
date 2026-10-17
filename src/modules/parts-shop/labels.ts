/** The translated names of the parts shop's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { ProductStock, ProductUnit, ShopOrderStatus, ShopOrderStep } from "./model.ts";

export const shopLabels = defineLabels({
	productUnit: {
		set: m.shop_unit_set,
		piece: m.shop_unit_piece,
		pair: m.shop_unit_pair,
	} satisfies Labels<ProductUnit>,
	productStock: {
		in_stock: m.shop_stock_in_stock,
		low: m.shop_stock_low,
		on_request: m.shop_stock_on_request,
	} satisfies Labels<ProductStock>,
	shopOrderStatus: {
		placed: m.shop_status_placed,
		confirmed: m.shop_status_confirmed,
		shipped: m.shop_status_shipped,
		delivered: m.shop_status_delivered,
		cancelled: m.shop_status_cancelled,
	} satisfies Labels<ShopOrderStatus>,
	shopOrderStep: {
		confirm: m.shop_step_confirm,
		ship: m.shop_step_ship,
		deliver: m.shop_step_deliver,
		cancel: m.shop_step_cancel,
	} satisfies Labels<ShopOrderStep>,
});
