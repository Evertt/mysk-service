/**
 * What a service contract means for an order. The one place that says so; the server applies it
 * (`#lib/server/contracts.ts`) and the pages show it.
 *
 * - **Coverage**: an order is covered when its unit was covered by a contract that was active on
 *   the day the order was created, unless it's an installation: contracts cover servicing a unit,
 *   not installing one. Should several contracts have covered the unit, the one with the fastest
 *   response counts.
 * - **Price**: what's included costs the customer nothing; it shows as a discount on the order.
 *   Basic includes no work (only the guaranteed response time), standard includes labour, premium
 *   includes labour and materials.
 * - **Response time (SLA)**: covered repairs are call-outs, to be responded to within the
 *   contract's response time from when the order was created. An order counts as responded to once
 *   it's scheduled (or further along: in progress, completed, invoiced). Until then it's on track,
 *   at risk once less than a quarter of the response time is left, and overdue from the deadline
 *   on. Cancelled orders and other types of work (maintenance, inspections) have no deadline.
 */
import type { OrderStatus, OrderType } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import { contractLabels } from "./labels.js";
import { type ContractLevel, contractStatus } from "./model.js";

/** What each level includes. */
export const included: Record<ContractLevel, { labor: boolean; materials: boolean }> = {
	basic: { labor: false, materials: false },
	standard: { labor: true, materials: false },
	premium: { labor: true, materials: true },
};

const includedLabels: Record<ContractLevel, () => string> = {
	basic: m.contracts_included_basic,
	standard: m.contracts_included_standard,
	premium: m.contracts_included_premium,
};

/** What a level includes, in words, e.g. "Labour and materials". */
export const includedLabel = (level: ContractLevel) => includedLabels[level]();

/** Whether a contract covers this type of work on a covered unit. */
export const isCoveredWork = (type: OrderType) => type !== "installation";

/** Of the contracts covering a unit, the one that covered it at `at`, if any: the fastest response wins. */
export function coveringContract<T extends { startsOn: Date; endsOn: Date; responseHours: number }>(
	contracts: readonly T[],
	at: Date,
): T | undefined {
	return contracts
		.filter((contract) => contractStatus(contract, at) === "active")
		.reduce<T | undefined>(
			(best, contract) => (best && best.responseHours <= contract.responseHours ? best : contract),
			undefined,
		);
}

/** The part of an order's price (in cents) that a contract of `level` includes. */
export function coveredAmount(level: ContractLevel, price: { materials: number; labor: number }) {
	return (
		(included[level].labor ? price.labor : 0) + (included[level].materials ? price.materials : 0)
	);
}

/** "Covered by CTR-2026-0004 (Premium)" */
export const coveredBy = (contract: { number: string; level: ContractLevel }) =>
	m.contracts_covered_by({
		number: contract.number,
		level: contractLabels.label("contractLevel", contract.level),
	});

// --- Response time ---------------------------------------------------------------------------

export const slaStates = ["on_track", "at_risk", "overdue", "responded"] as const;
export type SlaState = (typeof slaStates)[number];

/** At risk once less than this share of the response time is left. */
export const AT_RISK_SHARE = 0.25;

const HOUR = 60 * 60 * 1000;

/** Whether this type of work has to be responded to within the contract's response time. */
export const hasResponseTime = (type: OrderType) => type === "repair";

/**
 * A covered order's response deadline and where it stands at `now`, or `null` if it has none (not
 * a repair, or cancelled).
 */
export function responseDeadline(
	order: { type: OrderType; status: OrderStatus; createdAt: Date },
	responseHours: number,
	now = new Date(),
): { due: Date; state: SlaState } | null {
	if (!hasResponseTime(order.type) || order.status === "cancelled") return null;
	const window = responseHours * HOUR;
	const due = new Date(order.createdAt.getTime() + window);
	return { due, state: slaState(order.status, due, window, now) };
}

/** Where an order with a deadline of `due`, `window` milliseconds after it was created, stands. */
export function slaState(status: OrderStatus, due: Date, window: number, now: Date): SlaState {
	if (status !== "quote") return "responded";
	const left = due.getTime() - now.getTime();
	if (left <= 0) return "overdue";
	return left < window * AT_RISK_SHARE ? "at_risk" : "on_track";
}

/** Whether an order's response needs attention: at risk or overdue. */
export const needsAttention = (state: SlaState) => state === "at_risk" || state === "overdue";
