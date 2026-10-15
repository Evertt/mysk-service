/**
 * What is billed besides orders, as types: the invoicing module's `invoices.billableItems` point
 * (its `api/extensions.ts`) asks the other modules for them at runtime, and the seed's collectors
 * (`#lib/server/db/seed/module-seed.ts`) at seed time. Here in core because the seed is core's,
 * and core doesn't import modules.
 */

/** From and until which days (at midnight, both inclusive) to look for billable items. */
export interface BillingPeriod {
	from: Temporal.PlainDate;
	until: Temporal.PlainDate;
}

/** Something a module bills a customer for, other than an order. Amounts in cents. */
export interface BillableItem {
	/**
	 * Identifies the item across modules and over time, starting with the module's id, e.g.
	 * `contracts:12:2026-10-01` for a contract's October fee.
	 */
	reference: string;
	description: string;
	detail?: string;
	quantity: number;
	unitPrice: number;
	/** When it became due. */
	date: Temporal.PlainDate;
}
