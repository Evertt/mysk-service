/**
 * The contracts module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `server/` so client code (filters, badges) can import them.
 */
import { dayOf } from "#lib/dates.ts";
import type { OrderType } from "#lib/models.ts";
import type { NumberFormat } from "#lib/numbering.ts";

/** What a contract's number looks like, e.g. `CTR-2026-0007` (see `#lib/numbering.ts`). */
export const contractNumberFormat: NumberFormat = { prefix: "CTR-", digits: 4, yearly: true };

/** @labels contractLevel */
export const contractLevels = ["basic", "standard", "premium"] as const;
export type ContractLevel = (typeof contractLevels)[number];

/** The response time (in hours) a contract level promises by default. */
export const defaultResponseHours: Record<ContractLevel, number> = {
	basic: 72,
	standard: 24,
	premium: 4,
};

/**
 * Not stored: derived from the contract's period, see `contractStatus`.
 * @labels contractStatus
 */
export const contractStatuses = ["upcoming", "active", "expired"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

/**
 * Where `at` (a day, or a moment's day in the user's time zone; now by default) falls in a
 * contract's period; both its days are included.
 */
export function contractStatus(
	contract: { startsOn: Temporal.PlainDate; endsOn: Temporal.PlainDate },
	at: Temporal.PlainDate | Temporal.Instant = Temporal.Now.instant(),
): ContractStatus {
	const day = at instanceof Temporal.Instant ? dayOf(at) : at;
	if (Temporal.PlainDate.compare(day, contract.startsOn) < 0) return "upcoming";
	return Temporal.PlainDate.compare(day, contract.endsOn) <= 0 ? "active" : "expired";
}

/**
 * The work a contract covers on a covered unit: servicing it, which keeps it running (maintenance,
 * inspections) and puts it right when it fails (breakdowns, repairs). Not new work on it: an
 * installation, a survey for a quote or a project are sold on their own. Not damage either: an
 * accident or a third party caused it, not wear, so it's billed (and often claimed from whoever
 * did it). And not "other", which says nothing about what it is: the office picks a type the
 * contract covers when it is servicing.
 */
export const coveredOrderTypes = [
	"breakdown",
	"repair",
	"maintenance",
	"inspection",
] as const satisfies OrderType[];
