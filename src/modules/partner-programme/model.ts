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
 */
export const categoryRuleValues = ["yes", "no", "by_agreement"] as const;
export type CategoryRuleValue = (typeof categoryRuleValues)[number];

/**
 * How an order's revenue counts for the bonus, as the office classifies it: all of it, a share of
 * it (`share` percent), only for the level, or not at all (not even for the level).
 */
export const eligibilities = ["full", "partial", "level_only", "excluded"] as const;
export type Eligibility = (typeof eligibilities)[number];

/** The two bonus forms: paid out, or a (larger) credit for parts in the partner's wallet. */
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

/** A line of a partner's paid revenue, as the programme sees it. In cents, excluding VAT. */
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

/** The way to the next level: how far along (a whole percentage) and how much is left. */
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
		percent: Math.round((revenue / next.threshold) * 100),
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
	kind: WalletEntryKind;
	/** Signed, in cents. */
	amount: number;
	/** For credit that comes in (an award, a reversal, an adjustment up): its last valid day. */
	validUntil: Temporal.PlainDate | null;
	/** The closed year an award is for. */
	bonusYearId?: number | null;
	/** The day it was made: what goes out then takes only credit still valid that day. */
	on?: Temporal.PlainDate | null;
}

/** Credit that came in, and what's left of it. */
interface WalletLot {
	amount: number;
	remaining: number;
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

/**
 * The credit in a wallet, by what came in (entries in the order they were made): each amount that
 * went out (a spend, an expiry, an adjustment down) is taken from the credit that expires first
 * (of the credit still valid on the day it was made). An expiry takes from the credit past its date.
 */
function walletLots(entries: readonly WalletEntry[]): WalletLot[] {
	const lots: WalletLot[] = [];
	for (const entry of entries) {
		if (entry.amount > 0) {
			lots.push({
				amount: entry.amount,
				remaining: entry.amount,
				validUntil: entry.validUntil,
				bonusYearId: entry.bonusYearId ?? null,
			});
			continue;
		}
		let left = -entry.amount;
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
			const taken = Math.min(lot.remaining, left);
			lot.remaining -= taken;
			left -= taken;
			if (!left) break;
		}
	}
	return lots;
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
	const lots = walletLots(entries);
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
