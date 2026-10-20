/**
 * The partner programme's rules, as pure functions shared by its tables, the seed, the server and
 * the UI (see `docs/plans/shltr-domain.md`, §2.9): a partner's revenue in a year ("Partner Omzet")
 * sets its level, the part of it that qualifies ("Bonus Omzet", per bonus form) times the level's
 * percentage is its bonus, paid after the year closes as cash or as a larger parts credit in its
 * wallet, valid until the end of the year after. Amounts in cents, rates in basis points (hundredths
 * of a percent: 380 is 3.8 %).
 */
import type { OrderType } from "#lib/models.ts";

// --- Revenue categories and how they count -------------------------------------------------------

/**
 * What revenue is, for the programme ("Omzet die meetelt"): a fixed list, whose labels are messages.
 * Each year's rules say per category whether it counts for the level, the cash bonus and the credit.
 * @labels revenueCategory
 */
export const revenueCategories = [
	"maintenance_contracts",
	"service_maintenance",
	"regular_parts",
	"regular_orders",
	"projects_regular",
	"special_project_prices",
	"tenders",
] as const;
export type RevenueCategory = (typeof revenueCategories)[number];

/**
 * Whether a category's revenue counts for a bonus form: always, never, or as the order's
 * classification says ("volgens afspraak"; without one, it doesn't).
 * @labels categoryRule
 */
export const categoryRuleValues = ["yes", "no", "by_agreement"] as const;
/** @public Only the generated `labels.gen.ts` reads it, which knip doesn't see. */
export type CategoryRuleValue = (typeof categoryRuleValues)[number];

/**
 * How an order's revenue counts for the bonus, as the office classifies it: all of it, a share of
 * it (`share` percent), only for the level, or not at all (not even for the level).
 * @labels eligibility
 */
export const eligibilities = ["full", "partial", "level_only", "excluded"] as const;
export type Eligibility = (typeof eligibilities)[number];

/**
 * The two bonus forms: paid out, or a (larger) credit for parts in the partner's wallet.
 * @labels bonusForm
 */
export const bonusForms = ["cash", "credit"] as const;
export type BonusForm = (typeof bonusForms)[number];

/**
 * A partner's year: building up while it runs (no row: its figures are computed), then frozen when
 * it's closed.
 */
export const bonusYearStatuses = ["accruing", "finalised"] as const;

/**
 * The wallet's ledger: credit awarded for a year, spent (in the shop, later), a spend given back,
 * credit expired past its date, and corrections by hand. Signed amounts; the balance is their sum.
 * @labels walletEntryKind
 */
export const walletEntryKinds = ["award", "spend", "reversal", "expiry", "adjustment"] as const;
export type WalletEntryKind = (typeof walletEntryKinds)[number];

/** A category's rule in a year. */
export interface CategoryRule {
	category: RevenueCategory;
	/** Counts for the Partner Omzet, and so for the level. */
	level: boolean;
	cash: CategoryRuleValue;
	credit: CategoryRuleValue;
}

/** A level of the programme: from `threshold` Partner Omzet on (cents), with its rates (bp). */
export interface Tier {
	threshold: number;
	level: string;
	cashRate: number;
	creditRate: number;
}

/** A year's rules, as a manager sets them. */
export interface ProgrammeRules {
	year: number;
	/** By threshold, lowest first. */
	tiers: Tier[];
	/** One per category, in `revenueCategories`' order. */
	categories: CategoryRule[];
	/** Credit for the year is valid until 31 December this many years later (1: the next year). */
	creditValidYears: number;
}

/** SHLTR's categories ("Omzet die meetelt"): all count for the level, tenders for no bonus. */
export const defaultCategoryRules: CategoryRule[] = revenueCategories.map((category) => {
	if (category === "tenders") return { category, level: true, cash: "no", credit: "no" };
	if (category === "projects_regular" || category === "special_project_prices") {
		return { category, level: true, cash: "by_agreement", credit: "by_agreement" };
	}
	return { category, level: true, cash: "yes", credit: "yes" };
});

/**
 * SHLTR's levels (§2.9), the ones a tenant's first year starts with: from € 50.000 Partner Omzet
 * (BRONZE, 2.5 % cash or 3 % credit) up to ELITE+ from € 500.000.
 */
export const defaultTiers: Tier[] = [
	{ threshold: 5_000_000, level: "BRONZE", cashRate: 250, creditRate: 300 },
	{ threshold: 7_500_000, level: "SILVER", cashRate: 270, creditRate: 330 },
	{ threshold: 10_000_000, level: "GOLD", cashRate: 300, creditRate: 380 },
	{ threshold: 15_000_000, level: "GOLD+", cashRate: 350, creditRate: 430 },
	{ threshold: 20_000_000, level: "PLATINUM", cashRate: 380, creditRate: 480 },
	{ threshold: 25_000_000, level: "PLATINUM+", cashRate: 400, creditRate: 500 },
	{ threshold: 35_000_000, level: "ELITE", cashRate: 430, creditRate: 540 },
	{ threshold: 50_000_000, level: "ELITE+", cashRate: 450, creditRate: 560 },
];

/** Every category's rule, in `revenueCategories`' order: a missing one as `defaultCategoryRules` has it. */
export function completeCategories(rules: readonly CategoryRule[]): CategoryRule[] {
	return revenueCategories.map((category) => {
		const { level, cash, credit } =
			rules.find((rule) => rule.category === category) ??
			defaultCategoryRules.find((rule) => rule.category === category)!;
		return { category, level, cash, credit };
	});
}

/**
 * An order's category unless the office says otherwise, by its type: work on units is service and
 * maintenance, a project a project with regular conditions, the rest regular orders.
 */
export const defaultCategories: Record<OrderType, RevenueCategory> = {
	breakdown: "service_maintenance",
	repair: "service_maintenance",
	maintenance: "service_maintenance",
	inspection: "service_maintenance",
	damage: "service_maintenance",
	installation: "regular_orders",
	survey: "regular_orders",
	other: "regular_orders",
	project: "projects_regular",
};

/**
 * The category of a line on an invoice: its order's (as classified, else by the order's type); a
 * contract's fee (another module's item, whose reference starts with `contracts:`) is maintenance
 * contracts; anything else (a line typed in, another module's item) a regular order.
 */
export function lineCategory(line: {
	source: string | null;
	order: { type: OrderType; category: RevenueCategory | null } | null;
}): RevenueCategory {
	if (line.order) return line.order.category ?? defaultCategories[line.order.type];
	if (line.source?.startsWith("contracts:")) return "maintenance_contracts";
	return "regular_orders";
}

/**
 * The reference on the line of the credit note a cash bonus is paid out with, e.g.
 * `partner-programme:bonus:12` for the bonus year with id 12.
 */
export const bonusLineSource = (bonusYearId: number) => `partner-programme:bonus:${bonusYearId}`;

/** What every bonus line's reference starts with. */
export const bonusSourcePrefix = "partner-programme:";

/**
 * Whether a line of the revenue is the programme's own payout (a cash bonus's credit note): that
 * isn't a return or a correction of what the partner bought, so it doesn't count against its
 * revenue. Every other credit note's line does, in the category of the line it credits.
 */
export const isBonusPayout = (line: { source: string | null }) =>
	!!line.source?.startsWith(bonusSourcePrefix);

/**
 * A line of a partner's paid revenue, as the programme sees it. In cents, excluding VAT; negative
 * for a settled credit note's (`paidInvoiceLines()` in invoicing's `api/revenue.server.ts`).
 */
export interface RevenueLine {
	amount: number;
	category: RevenueCategory;
	/** The order's classification, if the office set one. */
	eligibility: Eligibility | null;
	/** For `partial`: the percentage that counts (0–100). */
	share: number | null;
}

const ruleOf = (rules: ProgrammeRules, category: RevenueCategory) =>
	rules.categories.find((rule) => rule.category === category) ??
	defaultCategoryRules.find((rule) => rule.category === category)!;

/** Whether a line counts for the Partner Omzet (the level): its category does and it's not excluded. */
export const countsForLevel = (rules: ProgrammeRules, line: RevenueLine) =>
	ruleOf(rules, line.category).level && line.eligibility !== "excluded";

/**
 * How much of a line counts for a bonus form, from 0 to 1: nothing if its category never does; else
 * as its order is classified (all, its share, or nothing for level only or excluded); without a
 * classification, all of it if its category always counts, nothing if only by agreement.
 */
export function bonusShare(rules: ProgrammeRules, line: RevenueLine, form: BonusForm): number {
	const rule = ruleOf(rules, line.category)[form];
	if (rule === "no") return 0;
	switch (line.eligibility) {
		case "full":
			return 1;
		case "partial":
			return Math.min(100, Math.max(0, line.share ?? 0)) / 100;
		case "level_only":
		case "excluded":
			return 0;
		case null:
			return rule === "yes" ? 1 : 0;
	}
}

// --- Levels and bonus ----------------------------------------------------------------------------

/** The tiers lowest first. */
export const sortedTiers = (tiers: readonly Tier[]): Tier[] =>
	tiers
		.toSorted((a, b) => a.threshold - b.threshold)
		.map(({ threshold, level, cashRate, creditRate }) => ({
			threshold,
			level,
			cashRate,
			creditRate,
		}));

/** The level reached with `revenue`: the highest tier at or below it, none below the first. */
export function levelFor(tiers: readonly Tier[], revenue: number): Tier | null {
	return sortedTiers(tiers).findLast((tier) => tier.threshold <= revenue) ?? null;
}

/** The next level up from `revenue`, none at the top. */
function nextTierFor(tiers: readonly Tier[], revenue: number): Tier | null {
	return sortedTiers(tiers).find((tier) => tier.threshold > revenue) ?? null;
}

/** `amount` at `rate` (bp), in whole cents. */
export const atRate = (amount: number, rate: number) => Math.round((amount * rate) / 10_000);

/**
 * The way to the next level: how far along (a whole percentage, rounded down, so never 100 short of
 * it, as `levelFor` counts) and how much is left (in cents).
 */
export interface Progress {
	next: Tier;
	percent: number;
	remaining: number;
}

/** What a partner's year adds up to. In cents. */
export interface YearFigures {
	/** What counts for the level. Never below zero. */
	partnerRevenue: number;
	/** What qualifies for each bonus form. Never below zero. */
	bonusRevenue: Record<BonusForm, number>;
	level: Tier | null;
	/** None at the top level. */
	progress: Progress | null;
	/** The bonus in each form at the level reached: none below the first level. */
	bonus: Record<BonusForm, number>;
}

/** The progress from `revenue` to the next tier, none at the top. */
export function progressFor(tiers: readonly Tier[], revenue: number): Progress | null {
	const next = nextTierFor(tiers, revenue);
	if (!next) return null;
	return {
		next,
		percent: Math.floor((revenue * 100) / next.threshold),
		remaining: next.threshold - revenue,
	};
}

/** A year's figures from a partner's revenue lines and the year's rules. */
export function yearFigures(rules: ProgrammeRules, lines: readonly RevenueLine[]): YearFigures {
	let partnerRevenue = 0;
	const bonusRevenue = { cash: 0, credit: 0 };
	for (const line of lines) {
		if (countsForLevel(rules, line)) partnerRevenue += line.amount;
		for (const form of bonusForms) {
			bonusRevenue[form] += Math.round(line.amount * bonusShare(rules, line, form));
		}
	}
	partnerRevenue = Math.max(0, partnerRevenue);
	bonusRevenue.cash = Math.max(0, bonusRevenue.cash);
	bonusRevenue.credit = Math.max(0, bonusRevenue.credit);
	return figuresFrom(rules.tiers, partnerRevenue, bonusRevenue);
}

/** The level, progress and bonus that follow from a year's revenue. */
export function figuresFrom(
	tiers: readonly Tier[],
	partnerRevenue: number,
	bonusRevenue: Record<BonusForm, number>,
): YearFigures {
	const level = levelFor(tiers, partnerRevenue);
	return {
		partnerRevenue,
		bonusRevenue,
		level,
		progress: progressFor(tiers, partnerRevenue),
		bonus: {
			cash: level ? atRate(bonusRevenue.cash, level.cashRate) : 0,
			credit: level ? atRate(bonusRevenue.credit, level.creditRate) : 0,
		},
	};
}

/** The first and last day of a year. */
export const yearSpan = (year: number) => ({
	from: new Temporal.PlainDate(year, 1, 1),
	until: new Temporal.PlainDate(year, 12, 31),
});

/** The last day a year's credit can be spent: 31 December, `validYears` later. */
export const creditValidUntil = (year: number, validYears: number) =>
	new Temporal.PlainDate(year + validYears, 12, 31);

/** Whether a year can be closed on `today`: once it's over. */
export const isClosable = (year: number, today: Temporal.PlainDate) => year < today.year;

/** Limits of the rules a manager sets. */
export const ruleLimits = {
	tiers: { min: 1, max: 12 },
	creditValidYears: { min: 1, max: 5 },
} as const;

// --- The wallet ----------------------------------------------------------------------------------

/** An entry of a partner's wallet, as the ledger has it. */
export interface WalletEntry {
	/** The entry's id, to ask what it took (`creditTaken()`). */
	id?: number;
	kind: WalletEntryKind;
	/** Signed, in cents. */
	amount: number;
	/**
	 * For credit that comes in (an award, a reversal, an adjustment up): its last valid day. A
	 * reversal gives back to the credit it was taken from: the one with this date and bonus year.
	 */
	validUntil: Temporal.PlainDate | null;
	/** The closed year an award is for (and a reversal of credit taken from it). */
	bonusYearId?: number | null;
	/** The day it was made: what goes out then takes only credit still valid that day. */
	on?: Temporal.PlainDate | null;
}

/** Credit that came in, and what's left of it. */
interface WalletLot {
	/** The entry it came in with. */
	id: number | undefined;
	amount: number;
	remaining: number;
	validUntil: Temporal.PlainDate | null;
	bonusYearId: number | null;
}

/**
 * A piece of the credit an amount going out took: how much, of which credit (its last valid day
 * and the year it was awarded for). Giving it back (`reversal`) gives back each piece as it was.
 */
export interface CreditPiece {
	amount: number;
	validUntil: Temporal.PlainDate | null;
	bonusYearId: number | null;
}

const byExpiry = (a: WalletLot, b: WalletLot) =>
	a.validUntil && b.validUntil
		? Temporal.PlainDate.compare(a.validUntil, b.validUntil)
		: a.validUntil
			? -1
			: b.validUntil
				? 1
				: 0;

const sameDay = (a: Temporal.PlainDate | null, b: Temporal.PlainDate | null) =>
	a === null || b === null ? a === b : a.equals(b);

/**
 * The wallet's ledger replayed (entries in the order they were made): the credit that came in, and
 * what each amount that went out (a spend, an expiry, an adjustment down) took of it, by entry id.
 * What goes out is taken from the credit that expires first (of the credit still valid on the day
 * it was made); an expiry takes from the credit past its date. A reversal gives back to the credit
 * it names (its date and bonus year) what was taken of it, so that credit is as it was before: also
 * past its date, if it's expired meanwhile; what it gives beyond that comes in as credit of its own.
 */
function replayWallet(entries: readonly WalletEntry[]) {
	const lots: WalletLot[] = [];
	const taken = new Map<number, CreditPiece[]>();
	for (const entry of entries) {
		if (entry.amount > 0) {
			let left = entry.amount;
			if (entry.kind === "reversal") {
				const bonusYearId = entry.bonusYearId ?? null;
				for (const lot of lots) {
					if (lot.bonusYearId !== bonusYearId || !sameDay(lot.validUntil, entry.validUntil)) {
						continue;
					}
					const back = Math.min(lot.amount - lot.remaining, left);
					lot.remaining += back;
					left -= back;
					if (!left) break;
				}
			}
			if (left) {
				lots.push({
					id: entry.id,
					amount: left,
					remaining: left,
					validUntil: entry.validUntil,
					bonusYearId: entry.bonusYearId ?? null,
				});
			}
			continue;
		}
		let left = -entry.amount;
		const pieces: CreditPiece[] = [];
		const from = lots
			.filter((lot) => lot.remaining > 0)
			.filter((lot) =>
				entry.kind === "expiry"
					? !entry.validUntil ||
						!lot.validUntil ||
						Temporal.PlainDate.compare(lot.validUntil, entry.validUntil) <= 0
					: !entry.on ||
						!lot.validUntil ||
						Temporal.PlainDate.compare(lot.validUntil, entry.on) >= 0,
			)
			.sort(byExpiry);
		for (const lot of from) {
			const amount = Math.min(lot.remaining, left);
			lot.remaining -= amount;
			left -= amount;
			pieces.push({ amount, validUntil: lot.validUntil, bonusYearId: lot.bonusYearId });
			if (!left) break;
		}
		if (entry.id !== undefined) taken.set(entry.id, pieces);
	}
	return { lots, taken };
}

/**
 * What the entry `id` (a spend) took of the wallet's credit, piece by piece, oldest-expiring
 * first: what a reversal gives back, a piece at a time. None for an entry that took nothing.
 */
export const creditTaken = (entries: readonly WalletEntry[], id: number): CreditPiece[] =>
	replayWallet(entries).taken.get(id) ?? [];

/**
 * What's left of the credit each entry brought in, by the entry's id: an award's, an adjustment
 * up's, and a reversal's beyond what it gave back to the credit it names. Zero for an entry that
 * brought none in (what goes out, a reversal that gave all back). Stored with the entries
 * (`remaining`, written by `addEntry()`), so SQL adds up what's available as `walletSummary()`
 * does.
 */
export function creditLeft(entries: readonly WalletEntry[]): Map<number, number> {
	const left = new Map<number, number>();
	for (const entry of entries) if (entry.id !== undefined) left.set(entry.id, 0);
	for (const lot of replayWallet(entries).lots) {
		if (lot.id !== undefined) left.set(lot.id, lot.remaining);
	}
	return left;
}

/** What a wallet holds on `today`. In cents. */
export interface WalletSummary {
	/** The sum of the entries. */
	balance: number;
	/** What can be spent today: the credit that's still valid. */
	available: number;
	/** The credit still valid today, as it came in. */
	awarded: number;
	/** Of that, what's been used. */
	spent: number;
	/** The first day the available credit (or some of it) runs out; none without any. */
	validUntil: Temporal.PlainDate | null;
	/** Credit past its date that's still there: what the daily job expires. */
	expired: { amount: number; validUntil: Temporal.PlainDate; bonusYearId: number | null }[];
}

const validOn = (lot: WalletLot, today: Temporal.PlainDate) =>
	!lot.validUntil || Temporal.PlainDate.compare(lot.validUntil, today) >= 0;

/** A wallet's balance and what's available on `today`, from its entries in order. */
export function walletSummary(
	entries: readonly WalletEntry[],
	today: Temporal.PlainDate,
): WalletSummary {
	const { lots } = replayWallet(entries);
	const valid = lots.filter((lot) => validOn(lot, today));
	const available = valid.reduce((sum, lot) => sum + lot.remaining, 0);
	const awarded = valid.reduce((sum, lot) => sum + lot.amount, 0);
	const left = valid.filter((lot) => lot.remaining > 0 && lot.validUntil).sort(byExpiry);
	return {
		balance: Math.max(
			0,
			entries.reduce((sum, entry) => sum + entry.amount, 0),
		),
		available,
		awarded,
		spent: awarded - available,
		validUntil: left[0]?.validUntil ?? valid.findLast((lot) => lot.validUntil)?.validUntil ?? null,
		expired: lots
			.filter((lot) => !validOn(lot, today) && lot.remaining > 0)
			.map((lot) => ({
				amount: lot.remaining,
				validUntil: lot.validUntil!,
				bonusYearId: lot.bonusYearId,
			})),
	};
}
