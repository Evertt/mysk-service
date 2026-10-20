/**
 * The parts shop's rules (`docs/plans/shltr-domain.md`, §2.8), as pure functions shared by its
 * tables, the seed, the server and the UI: a product is one of the tenant's materials offered in its
 * customer portal, priced excluding VAT at the material's price; a partner orders with its Parts
 * Credit only, all of an order's total (excluding VAT, no VAT charged on it: an open question for the
 * client, §5), never more than it has, nor what's only on request. An order is numbered
 * `SH-2026-012`, sets its stock aside while it's open and goes from placed through confirmed and
 * shipped to delivered, or is cancelled before it's shipped: its credit and stock come back.
 * Amounts in cents.
 */
import type { NumberFormat } from "#lib/numbering.ts";

/**
 * How a product is sold: a set, one piece, or a pair ("per set", "per stuk", "per paar").
 * @labels productUnit
 */
export const productUnits = ["set", "piece", "pair"] as const;
export type ProductUnit = (typeof productUnits)[number];

/**
 * A shop order's way: placed (its credit and stock set aside, "gereserveerd"), confirmed by the
 * office, shipped, delivered; or cancelled before it's shipped.
 * @labels shopOrderStatus
 */
export const shopOrderStatuses = [
	"placed",
	"confirmed",
	"shipped",
	"delivered",
	"cancelled",
] as const;
export type ShopOrderStatus = (typeof shopOrderStatuses)[number];

/** The statuses of an order the office still has to handle. */
export const openShopOrderStatuses = [
	"placed",
	"confirmed",
	"shipped",
] as const satisfies ShopOrderStatus[];

/** Whether an order is still to be handled: not delivered or cancelled. */
export const isOpenShopOrder = (status: ShopOrderStatus) =>
	(openShopOrderStatuses as readonly ShopOrderStatus[]).includes(status);

/**
 * What the office can do with an order next.
 * @labels shopOrderStep
 */
export const shopOrderSteps = ["confirm", "ship", "deliver", "cancel"] as const;
export type ShopOrderStep = (typeof shopOrderSteps)[number];

/** Where each step takes an order, and from which statuses. */
const steps: Record<ShopOrderStep, { from: readonly ShopOrderStatus[]; to: ShopOrderStatus }> = {
	confirm: { from: ["placed"], to: "confirmed" },
	ship: { from: ["confirmed"], to: "shipped" },
	deliver: { from: ["shipped"], to: "delivered" },
	cancel: { from: ["placed", "confirmed"], to: "cancelled" },
};

/** The steps the office can take with an order in `status`, in their order. */
export const stepsFrom = (status: ShopOrderStatus): ShopOrderStep[] =>
	shopOrderSteps.filter((step) => steps[step].from.includes(status));

/** The status a step takes an order in `status` to; none if it can't be taken from there. */
export const statusAfter = (
	status: ShopOrderStatus,
	step: ShopOrderStep,
): ShopOrderStatus | null => (steps[step].from.includes(status) ? steps[step].to : null);

/** How a shop order is paid: with the partner's Parts Credit (the only way, for now). */
export const shopPayments = ["parts_credit"] as const;

/** A shop order's number: `SH-2026-012`, sequential per organization, the year in it. */
export const shopOrderNumberFormat: NumberFormat = { prefix: "SH-", digits: 3, yearly: true };

/** The most of a product one order takes. */
export const maxQuantity = 99;

// --- The catalogue -------------------------------------------------------------------------------

/** A product as the shop offers it: its material's price and stock, and the shop's own fields. */
export interface CatalogueProduct {
	id: number;
	/** Excluding VAT, in cents. */
	price: number;
	/** In pieces: the material's stock. */
	stock: number;
	onRequest: boolean;
	creditEligible: boolean;
}

/** Whether a product can be put in the cart: priced, not on request, payable with credit. */
export const isOrderable = (product: Pick<CatalogueProduct, "onRequest" | "creditEligible">) =>
	!product.onRequest && product.creditEligible;

/**
 * What the portal shows of a product's stock ("Op voorraad", "Laag voorraad", "Op aanvraag"): on
 * request when it's ordered so, or out; else low below the low threshold (as the materials' levels
 * have it), or in stock.
 * @labels productStock
 */
const productStocks = ["in_stock", "low", "on_request"] as const;
export type ProductStock = (typeof productStocks)[number];

export function productStock(
	product: { onRequest: boolean; stock: number },
	low: (stock: number) => boolean,
): ProductStock {
	if (product.onRequest || product.stock <= 0) return "on_request";
	return low(product.stock) ? "low" : "in_stock";
}

// --- Checkout ------------------------------------------------------------------------------------

/** A line of a cart: a product and how many. */
export interface CartLine {
	productId: number;
	quantity: number;
}

/** A line's amount: quantity × price, in cents. */
export const lineAmount = (quantity: number, price: number) => quantity * price;

/** A cart's total, excluding VAT (the products' prices are), in cents. Unknown products count 0. */
export function cartTotal(lines: readonly CartLine[], products: readonly CatalogueProduct[]) {
	const byId = new Map(products.map((product) => [product.id, product]));
	return lines.reduce(
		(sum, line) => sum + lineAmount(line.quantity, byId.get(line.productId)?.price ?? 0),
		0,
	);
}

/** The VAT charged on an order paid with Parts Credit: none (see the module's notes). */
export const creditOrderVat = (_total: number) => 0;

/** Why a cart can't be checked out, each with the product it's about (if one). */
export type CheckoutProblem =
	| { kind: "empty" }
	| { kind: "unknown"; productId: number }
	| { kind: "quantity"; productId: number }
	| { kind: "on_request"; productId: number }
	| { kind: "not_eligible"; productId: number }
	| { kind: "stock"; productId: number; stock: number }
	| { kind: "balance"; total: number; available: number };

/**
 * What stands in the way of paying for `lines` with `available` credit: an empty cart, a product
 * that isn't the tenant's (or not in the shop), a quantity that isn't a whole number from 1 to
 * `maxQuantity`, a product on request or not payable with credit, more than is in stock, or a total
 * above the credit available (the balance would go below zero). None: it can be ordered.
 */
export function checkoutProblems(
	lines: readonly CartLine[],
	products: readonly CatalogueProduct[],
	available: number,
): CheckoutProblem[] {
	if (!lines.length) return [{ kind: "empty" }];
	const byId = new Map(products.map((product) => [product.id, product]));
	const problems: CheckoutProblem[] = [];
	const quantities = new Map<number, number>();
	for (const line of lines) {
		quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
	}
	for (const [productId, quantity] of quantities) {
		const product = byId.get(productId);
		if (!product) problems.push({ kind: "unknown", productId });
		else if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
			problems.push({ kind: "quantity", productId });
		} else if (product.onRequest) problems.push({ kind: "on_request", productId });
		else if (!product.creditEligible) problems.push({ kind: "not_eligible", productId });
		else if (quantity > product.stock) {
			problems.push({ kind: "stock", productId, stock: product.stock });
		}
	}
	if (problems.length) return problems;
	const total = cartTotal(lines, products);
	if (total > available) return [{ kind: "balance", total, available }];
	return [];
}

/** The credit left after paying `total`: what the checkout shows as "Saldo na bestelling". */
export const balanceAfter = (available: number, total: number) => available - total;

/** The cart's lines, one per product, their quantities added up, in the order first added. */
export function mergeLines(lines: readonly CartLine[]): CartLine[] {
	const merged = new Map<number, number>();
	for (const line of lines) {
		merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
	}
	return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}
