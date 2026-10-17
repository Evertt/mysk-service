import { describe, expect, test } from "vite-plus/test";

import {
	atRate,
	bonusShare,
	completeCategories,
	countsForLevel,
	creditTaken,
	creditValidUntil,
	defaultCategoryRules,
	defaultTiers,
	isClosable,
	levelFor,
	lineCategory,
	type ProgrammeRules,
	type RevenueLine,
	type WalletEntry,
	walletSummary,
	yearFigures,
} from "#modules/partner-programme/model.ts";
import { day } from "#unit/temporal-support.ts";

/** SHLTR's programme (§2.9 of `docs/plans/shltr-domain.md`). */
const shltr: ProgrammeRules = {
	year: 2026,
	tiers: defaultTiers,
	categories: defaultCategoryRules,
	creditValidYears: 1,
};

const euros = (amount: number) => amount * 100;
const line = (amount: number, overrides: Partial<RevenueLine> = {}): RevenueLine => ({
	amount: euros(amount),
	category: "service_maintenance",
	eligibility: null,
	share: null,
	...overrides,
});

describe("the levels", () => {
	test("are the highest tier at or below the Partner Omzet, none below the first", () => {
		expect(levelFor(defaultTiers, euros(49_999))).toBeNull();
		expect(levelFor(defaultTiers, euros(50_000))?.level).toBe("BRONZE");
		expect(levelFor(defaultTiers, euros(200_000))?.level).toBe("PLATINUM");
		expect(levelFor(defaultTiers, euros(249_999))?.level).toBe("PLATINUM");
		expect(levelFor(defaultTiers, euros(2_000_000))?.level).toBe("ELITE+");
	});

	test("pay the tier table's bonus at their threshold, if all of it qualifies", () => {
		// "Cash Bonus*" and "SHLTR Parts Credit*": the threshold × the rate.
		expect(defaultTiers.map((tier) => atRate(tier.threshold, tier.cashRate) / 100)).toEqual([
			1_250, 2_025, 3_000, 5_250, 7_600, 10_000, 15_050, 22_500,
		]);
		expect(defaultTiers.map((tier) => atRate(tier.threshold, tier.creditRate) / 100)).toEqual([
			1_500, 2_475, 3_800, 6_450, 9_600, 12_500, 18_900, 28_000,
		]);
	});
});

describe("a year's figures", () => {
	test("reproduce the dashboard card: 200.000 Partner Omzet, 80.000 Bonus Omzet", () => {
		const figures = yearFigures(shltr, [
			line(120_000, { category: "projects_regular", eligibility: "level_only" }),
			line(80_000),
		]);
		expect(figures.partnerRevenue).toBe(euros(200_000));
		expect(figures.bonusRevenue).toEqual({ cash: euros(80_000), credit: euros(80_000) });
		expect(figures.level?.level).toBe("PLATINUM");
		// 80.000 × 3,8 % and × 4,8 %.
		expect(figures.bonus).toEqual({ cash: euros(3_040), credit: euros(3_840) });
		// "€ 200.000 van € 250.000 · 80 %", "Nog € 50.000 tot PLATINUM+".
		expect(figures.progress).toEqual({
			next: defaultTiers[5],
			percent: 80,
			remaining: euros(50_000),
		});
	});

	test("count a project for the level only unless agreed otherwise (the worked example)", () => {
		// "Van € 200.000 Partner Omzet is € 120.000 projectomzet uitgesloten van beide bonusvormen."
		const figures = yearFigures(shltr, [
			line(120_000, { category: "projects_regular" }),
			line(50_000),
			line(30_000, { category: "maintenance_contracts" }),
		]);
		expect(figures.partnerRevenue).toBe(euros(200_000));
		expect(figures.bonusRevenue.cash).toBe(euros(80_000));
		expect(figures.level?.level).toBe("PLATINUM");
	});

	test("count a project as agreed: in full or a share of it", () => {
		const full = line(100_000, { category: "special_project_prices", eligibility: "full" });
		const partial = line(100_000, {
			category: "projects_regular",
			eligibility: "partial",
			share: 25,
		});
		const figures = yearFigures(shltr, [full, partial]);
		expect(figures.partnerRevenue).toBe(euros(200_000));
		expect(figures.bonusRevenue.credit).toBe(euros(125_000));
	});

	test("leave tenders out of the bonus, and excluded orders out of everything", () => {
		const tender = line(100_000, { category: "tenders", eligibility: "full" });
		const excluded = line(40_000, { eligibility: "excluded" });
		expect(bonusShare(shltr, tender, "cash")).toBe(0);
		expect(countsForLevel(shltr, tender)).toBe(true);
		expect(countsForLevel(shltr, excluded)).toBe(false);
		const figures = yearFigures(shltr, [tender, excluded, line(10_000)]);
		expect(figures.partnerRevenue).toBe(euros(110_000));
		expect(figures.bonusRevenue.cash).toBe(euros(10_000));
		expect(figures.bonus.cash).toBe(atRate(euros(10_000), 300));
	});

	test("give no bonus below the first level", () => {
		const figures = yearFigures(shltr, [line(49_000)]);
		expect(figures.level).toBeNull();
		expect(figures.bonus).toEqual({ cash: 0, credit: 0 });
		expect(figures.progress?.next.level).toBe("BRONZE");
		expect(figures.progress?.remaining).toBe(euros(1_000));
	});

	test("have no next level at the top", () => {
		expect(yearFigures(shltr, [line(600_000)]).progress).toBeNull();
	});

	test("can differ between the forms, as the year's rules say", () => {
		const rules = {
			...shltr,
			categories: completeCategories([
				{ category: "regular_parts", level: true, cash: "no", credit: "yes" },
			]),
		};
		const figures = yearFigures(rules, [line(100_000, { category: "regular_parts" })]);
		expect(figures.bonusRevenue).toEqual({ cash: 0, credit: euros(100_000) });
	});

	test("never go below zero", () => {
		const figures = yearFigures(shltr, [line(-500)]);
		expect(figures.partnerRevenue).toBe(0);
		expect(figures.bonusRevenue).toEqual({ cash: 0, credit: 0 });
	});
});

describe("a line's category", () => {
	test("is its order's classification, else the order type's default", () => {
		const order = (type: "project" | "breakdown" | "installation") => ({ type, category: null });
		expect(lineCategory({ source: null, order: order("project") })).toBe("projects_regular");
		expect(lineCategory({ source: null, order: order("breakdown") })).toBe("service_maintenance");
		expect(lineCategory({ source: null, order: order("installation") })).toBe("regular_orders");
		expect(
			lineCategory({
				source: null,
				order: { type: "project", category: "special_project_prices" },
			}),
		).toBe("special_project_prices");
	});

	test("is maintenance contracts for a contract's fee, else a regular order", () => {
		expect(lineCategory({ source: "contracts:12:2026-10-01", order: null })).toBe(
			"maintenance_contracts",
		);
		expect(lineCategory({ source: null, order: null })).toBe("regular_orders");
		expect(lineCategory({ source: "other:1", order: null })).toBe("regular_orders");
	});
});

describe("the year cycle", () => {
	test("closes a year once it's over, with credit valid until the end of the next", () => {
		expect(isClosable(2025, day("2026-01-01"))).toBe(true);
		expect(isClosable(2026, day("2026-12-31"))).toBe(false);
		expect(creditValidUntil(2025, 1)).toEqual(day("2026-12-31"));
		expect(creditValidUntil(2025, 2)).toEqual(day("2027-12-31"));
	});
});

describe("the wallet", () => {
	const award = (amount: number, validUntil: string) => ({
		kind: "award" as const,
		amount: euros(amount),
		validUntil: day(validUntil),
	});
	const spend = (amount: number) => ({
		kind: "spend" as const,
		amount: -euros(amount),
		validUntil: null,
	});

	test("shows the mockup's wallet: 3.750 awarded, 1.475 spent, 2.275 available", () => {
		const wallet = walletSummary(
			[award(3_750, "2026-12-31"), spend(1_000), spend(475)],
			day("2026-10-17"),
		);
		expect(wallet).toEqual({
			balance: euros(2_275),
			available: euros(2_275),
			awarded: euros(3_750),
			spent: euros(1_475),
			validUntil: day("2026-12-31"),
			expired: [],
		});
	});

	test("spends the credit that expires first", () => {
		const entries = [award(1_000, "2026-12-31"), award(500, "2025-12-31"), spend(700)];
		expect(walletSummary(entries, day("2025-06-01")).available).toBe(euros(800));
		// The older credit went first: 800 of the newer is left, none expires.
		const later = walletSummary(entries, day("2026-01-02"));
		expect(later.available).toBe(euros(800));
		expect(later.expired).toEqual([]);
	});

	test("expires what's left past its date, once", () => {
		const entries = [award(1_000, "2025-12-31"), spend(300), award(400, "2026-12-31")];
		const summary = walletSummary(entries, day("2026-01-01"));
		expect(summary.expired).toEqual([
			{ amount: euros(700), validUntil: day("2025-12-31"), bonusYearId: null },
		]);
		expect(summary.available).toBe(euros(400));
		const expiry = { kind: "expiry" as const, amount: -euros(700), validUntil: day("2025-12-31") };
		const after = walletSummary([...entries, expiry], day("2026-01-01"));
		expect(after.expired).toEqual([]);
		expect(after.balance).toBe(euros(400));
		expect(after.available).toBe(euros(400));
	});

	test("doesn't spend credit past its date, which still expires", () => {
		const entries = [
			award(1_200, "2025-12-31"),
			award(2_000, "2026-12-31"),
			{ ...spend(350), on: day("2026-06-03") },
		];
		const summary = walletSummary(entries, day("2026-10-17"));
		expect(summary.available).toBe(euros(1_650));
		expect(summary.expired).toEqual([
			{ amount: euros(1_200), validUntil: day("2025-12-31"), bonusYearId: null },
		]);
	});

	test("never shows a balance below zero", () => {
		expect(walletSummary([spend(10)], day("2026-01-01")).balance).toBe(0);
	});
});

describe("the wallet's replay", () => {
	const entries: WalletEntry[] = [
		{ id: 1, kind: "award", amount: euros(1_000), validUntil: day("2026-12-31"), bonusYearId: 11 },
		{ id: 2, kind: "award", amount: euros(500), validUntil: day("2025-12-31"), bonusYearId: 10 },
		{ id: 3, kind: "spend", amount: -euros(700), validUntil: null, on: day("2025-06-01") },
	];
	/** A reversal of each piece the entry `id` took, as cancelling a shop order writes them. */
	const reversalsOf = (ledger: WalletEntry[], id: number): WalletEntry[] =>
		creditTaken(ledger, id).map((piece) => ({ kind: "reversal", ...piece }));

	test("says which credit a spend took, the credit that expires first first", () => {
		expect(creditTaken(entries, 3)).toEqual([
			{ amount: euros(500), validUntil: day("2025-12-31"), bonusYearId: 10 },
			{ amount: euros(200), validUntil: day("2026-12-31"), bonusYearId: 11 },
		]);
		expect(creditTaken(entries, 1)).toEqual([]);
		expect(creditTaken(entries, 99)).toEqual([]);
	});

	test("gives a spend back piece by piece, as if it hadn't been spent", () => {
		const after = [...entries, ...reversalsOf(entries, 3)];
		expect(walletSummary(after, day("2025-06-02"))).toEqual(
			walletSummary(entries.slice(0, 2), day("2025-06-02")),
		);
		expect(walletSummary(after, day("2025-06-02"))).toMatchObject({
			awarded: euros(1_500),
			spent: 0,
			available: euros(1_500),
		});
	});

	test("gives credit back expired that has expired since, for the job to expire again", () => {
		// Spent in June 2025, all of the credit valid until its end; cancelled in February 2026.
		const after = [...entries, ...reversalsOf(entries, 3)];
		const summary = walletSummary(after, day("2026-02-01"));
		expect(summary.available).toBe(euros(1_000));
		expect(summary.expired).toEqual([
			{ amount: euros(500), validUntil: day("2025-12-31"), bonusYearId: 10 },
		]);
		const expired = [
			...after,
			{ kind: "expiry" as const, amount: -euros(500), validUntil: day("2025-12-31") },
		];
		expect(walletSummary(expired, day("2026-02-01"))).toMatchObject({
			balance: euros(1_000),
			available: euros(1_000),
			expired: [],
		});
	});

	test("keeps credit given back beyond what was taken as credit of its own", () => {
		const after: WalletEntry[] = [
			...entries,
			{ kind: "reversal", amount: euros(800), validUntil: day("2026-12-31"), bonusYearId: 11 },
		];
		expect(walletSummary(after, day("2025-06-02")).available).toBe(euros(1_600));
	});
});
