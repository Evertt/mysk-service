/**
 * The contracts module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `$lib/server` so client code (filters, badges) can import them.
 */

export const contractLevels = ["basic", "standard", "premium"] as const;
export type ContractLevel = (typeof contractLevels)[number];

/** The response time (in hours) a contract level promises by default. */
export const defaultResponseHours: Record<ContractLevel, number> = {
	basic: 72,
	standard: 24,
	premium: 4,
};

/** Not stored: derived from the contract's period, see `contractStatus`. */
export const contractStatuses = ["upcoming", "active", "expired"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

/** Where `now` falls in a contract's period; both dates are inclusive days. */
export function contractStatus(
	contract: { startsOn: Date; endsOn: Date },
	now = new Date(),
): ContractStatus {
	if (now < contract.startsOn) return "upcoming";
	const afterEnd = new Date(contract.endsOn);
	afterEnd.setDate(afterEnd.getDate() + 1);
	return now < afterEnd ? "active" : "expired";
}
