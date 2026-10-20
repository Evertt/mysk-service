/** How the parts shop shows a product's stock and an order's status: as badges, coloured by what they mean. */
import type { BadgeDisplay } from "#lib/i18n/index.ts";

import { shopLabels } from "./labels.ts";
import type { ProductStock, ShopOrderStatus } from "./model.ts";

/** A product's stock: "Op voorraad", "Laag voorraad" or "Op aanvraag". */
export const productStockDisplay = shopLabels.withLabels("productStock", {
	in_stock: { tone: "success" },
	low: { tone: "warning" },
	on_request: { tone: "neutral" },
} satisfies Record<ProductStock, BadgeDisplay>);

/**
 * A shop order's status: placed and confirmed still to do, shipped on its way, delivered done,
 * cancelled out of the picture.
 */
export const shopOrderStatusDisplay = shopLabels.withLabels("shopOrderStatus", {
	placed: { tone: "warning" },
	confirmed: { tone: "info" },
	shipped: { tone: "info" },
	delivered: { tone: "success" },
	cancelled: { tone: "neutral" },
} satisfies Record<ShopOrderStatus, BadgeDisplay>);
