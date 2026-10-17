/**
 * What the partner programme makes for a tenant at seed time, in the draft's
 * `modules["partner-programme"]`: for a module that requires it and pays with the credit (the parts
 * shop), the partners' spends that are its orders. Only types.
 */

/**
 * A spend of a partner's credit in the demo, as the programme seeds it: the module whose order it
 * is (by `order`, its number) may set what it comes to and its note, before the programme inserts
 * it.
 */
export interface SeedSpend {
	/** In cents, more than zero. */
	amount: number;
	note: string;
	on: Date;
	/** The shop order it paid, e.g. `SH-2026-007`. */
	order?: string;
}

/** The programme's part of the draft: the spends that are another module's orders. */
export interface PartnersDraft {
	/** By the draft's customer id; the spends are the programme's own, to change in place. */
	orderSpends: { customerId: number; spend: SeedSpend }[];
}
