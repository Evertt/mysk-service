/**
 * The orders' extension points: where modules take part in costing, pricing, badging and saving
 * orders (see `#lib/server/extensions.ts`), on an order's page, in its form and in the orders
 * list's selection (see `#lib/extensions/define.ts`). Each hook has one caller in
 * `#lib/orders/server/`: `priceOrders()` (`pricing.ts`, for `costs` and `adjustPrices`),
 * `tagOrders()`, `orderCommitted()` and `saveOrderParts()` (`hooks.ts`). Isomorphic, so the types
 * are also there for the pages that show costs, tags and adjustments.
 */
import {
	defineBulkTable,
	defineCollector,
	defineEvent,
	defineFormSlot,
	defineSaveHook,
	defineSlot,
} from "#lib/extensions/define.ts";
import type { FormPartsOutput } from "#lib/extensions/form-parts.ts";
import type { OrderStatus, OrderType } from "#lib/models.ts";
// Only the type: this file is isomorphic.
import type { Transaction } from "#lib/server/db/index.ts";

/** An order as a module's bulk action sees a selected row of the orders list. */
export interface OrderBulkRow {
	id: number;
	number: string;
	status: OrderStatus;
	customer: { id: number; code: string; name: string };
}

/** What a module gets to know about an order. All of the current tenant's. */
export interface OrderFacts {
	id: number;
	type: OrderType;
	status: OrderStatus;
	/** The units it's about, in their order (`withUnitIds()` adds them to orders); often one. */
	equipmentIds: readonly number[];
	createdAt: Temporal.Instant;
}

/**
 * Something an order costs besides labour, as one of the tenant's modules adds it: e.g. the
 * materials used on it. In cents.
 */
export interface OrderCost {
	/** What it is, e.g. "Materials". */
	label: string;
	amount: number;
	/**
	 * What it's made of, when the caller asks for items (a page that shows an order or a few): e.g.
	 * a line per material, with links to the materials.
	 */
	items?: OrderCostItem[];
	/** Shown in place of the items when there are none, e.g. "No materials on this order." */
	empty?: string;
}

/** One of the things a cost is made of, as an order's page lists it. In cents. */
export interface OrderCostItem {
	/** Unique among the cost's items. */
	key: string;
	label: string;
	/** A second line under the label, e.g. a material's SKU. */
	detail?: string;
	/**
	 * The record it is, to link the label to its page the way the activity log links it
	 * (`subjectHref()` in `#lib/activity/subjects.ts`), e.g. `{ type: "material", … }`.
	 */
	subject?: { type: string; id: string; label: string };
	/** Formatted with its unit, e.g. "2.5 m". */
	quantity: string;
	unitPrice: number;
	amount: number;
}

/** An order with its price before adjustments, in cents. */
export interface PricedOrderFacts extends OrderFacts {
	labor: number;
	/** What the modules add to it besides labour (`costs`). */
	costs: OrderCost[];
}

/** What happened to an order that core has saved. */
export interface OrderChange {
	number: string;
}

/**
 * A badge a module puts next to an order's status, on the order's page and in the orders table,
 * e.g. a response time about to be missed.
 */
export interface OrderTag {
	label: string;
	/** `warning` needs attention soon, `danger` now. */
	tone: "warning" | "danger";
	/** Shown on hover, e.g. the deadline. */
	detail?: string;
}

/**
 * A change a module makes to an order's price, shown as a line of its own on the order: e.g. work
 * a service contract includes. In cents; negative for a discount.
 */
export interface PriceAdjustment {
	label: string;
	/** A second line under the label, e.g. what's included. */
	detail?: string;
	amount: number;
}

/**
 * What orders cost besides labour, by order id: a module's one cost per order, e.g. the materials
 * used on it. With `items`, also what each cost is made of, for a page that shows them. Asked
 * before `adjustPrices`, which gets the costs. A module that fails fails the pricing.
 */
export const costs = defineCollector<
	{ orders: OrderFacts[]; items: boolean },
	Map<number, OrderCost>
>("orders.costs", { onError: "fail" });

/**
 * Changes to orders' prices, by order id, e.g. the work a contract includes, as a discount. A
 * module that fails fails the pricing: a broken price must not quietly become a wrong total.
 */
export const adjustPrices = defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>(
	"orders.adjustPrices",
	{ onError: "fail" },
);

/**
 * Badges for orders (at `now`), by order id, e.g. a response time about to be missed. A module
 * that fails is left out: the orders still show, without its badges.
 */
export const tag = defineCollector<
	{ orders: OrderFacts[]; now: Temporal.Instant },
	Map<number, OrderTag[]>
>("orders.tag", { onError: "skip" });

/**
 * Core has saved an order. A module refreshes its own queries about it (e.g. what its card on the
 * order's page shows), so they come back with the save, like core's.
 */
export const committed = defineEvent<OrderChange>("orders.committed");

/**
 * Core is changing one of the tenant's orders, in `tx`: creating or updating it from the order form
 * (with `form`), changing its status (in bulk, on the schedule, in the portal) or deleting it.
 */
export interface OrderSaving {
	/** The transaction core changes the order in: a module saves its part in it too. */
	tx: Transaction;
	order: { id: number; number: string };
	/** Its status once changed; `null` while it's being deleted (before its row goes). */
	status: OrderStatus | null;
	/**
	 * When it's saved from the order form, the modules' parts of it (`form`), by module id, validated
	 * by their schemas (`form-parts/orders.form.ts`); a module's part is absent when the form
	 * rendered none of its inputs. Only the tenant's modules' parts. Absent for other changes.
	 */
	form?: OrderFormParts;
}

/** The modules' parts of the order form, by module id, as validated by their schemas. */
export type OrderFormParts = FormPartsOutput<"orders.form">;

/**
 * Why a module can't save its part of an order, as a Standard Schema issue, which the order form
 * passes to `invalid()` as it is: what its schema can't check, e.g. a stock shortage.
 */
export interface OrderProblem {
	message: string;
	/**
	 * The order form's field it's about (from the form's root, e.g.
	 * `["modules", "materials", "lines", 2, "quantity"]`), or none for the whole change.
	 */
	path?: (string | number)[];
}

/**
 * A module saves its part of an order that core is changing (`OrderSaving`), in core's transaction,
 * e.g. the materials the order form submitted and the stock that follows the order's status; or
 * answers why it can't, and the change is refused (the transaction stores nothing of it).
 */
export const saving = defineSaveHook<OrderSaving, OrderProblem>("orders.saving");

/**
 * Core is setting one of the tenant's orders' units (`setOrderUnits()`), in `tx`: when it's created
 * (by the order form or a module, through `createOrders()`) and when the order form saves it. The
 * units it gets are its units already (in their order) and the order as stored has its new type,
 * status and customer; the units it loses (`removed`) are still there, and go once every module has
 * let go of them (a module's rows that refer to them go with them). Units it keeps keep their rows.
 */
export interface OrderUnitsSaving {
	tx: Transaction;
	order: { id: number };
	/** The ids of the units it's about now, in their order. */
	equipmentIds: readonly number[];
	/** The ids of the units it's losing. */
	removed: readonly number[];
}

/**
 * A module saves its part of an order's units (`OrderUnitsSaving`) in core's transaction, e.g. a
 * checklist for each unit; or answers why a unit can't be taken off it, and the change is refused.
 * Its problems are about the order form's `equipmentIds`, unless they say otherwise.
 */
export const units = defineSaveHook<OrderUnitsSaving, OrderProblem>("orders.units");

/**
 * Parts of the order form, after the order's own card: a module's inputs, named with the `fields` of
 * its part (under the form's `modules.<module id>`, typed and validated by its
 * `form-parts/orders.form.ts`), are submitted with the order and saved with it (`saving`, as
 * `form`). The components load what they offer through their module's remote functions. `order` is
 * the order being edited, none for a new one.
 */
export const form = defineFormSlot<{ order: { id: number } | undefined }>("orders.form");

/**
 * Cards in the side column of an order's page. The components load their own data through their
 * module's remote functions, and render nothing when they have nothing to say.
 */
export const detailSide = defineSlot<{ number: string }>("orders.detail.side");

/**
 * Bulk actions on the orders list's selection, after the list's own (e.g. invoicing's "Create
 * invoice"). Their commands are made with `moduleRemote()`.
 */
export const list = defineBulkTable<OrderBulkRow>("orders.list");
