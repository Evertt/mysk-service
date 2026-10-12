/**
 * The contracts module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `server/` so client code (filters, badges) can import them.
 */
import { nextDay } from "#lib/dates.ts";
import type { NumberFormat } from "#lib/numbering.ts";

/** What a contract's number looks like, e.g. `CTR-2026-0007` (see `#lib/numbering.ts`). */
export const contractNumberFormat: NumberFormat = { prefix: "CTR-", digits: 4, yearly: true };

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
	return now < nextDay(contract.endsOn) ? "active" : "expired";
}
