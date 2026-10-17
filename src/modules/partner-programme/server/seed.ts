/**
 * The partner programme's demo data. SHLTR (`docs/plans/shltr-domain.md`, §2.9): its eight levels
 * for last year and this one, a dozen partners, classifications on their projects, and last year
 * closed with the choices made (one still waiting), as SHLTR's administration closed it (frozen
 * figures: the app only invoices from late last year). Riedel B.V. chose credit: € 3.750 in its
 * wallet, € 1.475 of it spent; this year three large projects (completed, invoiced and paid, for
 * the level only) take it to about PLATINUM, the plan's worked example. Weggemans Logistiek chose
 * cash, paid out as a credit note of the invoicing module's (`seedCreditNote()`, settled since
 * where two weeks have passed); the others who chose cash were paid outside the app. Vermeer Logistiek still has
 * credit of the year before last, past its date: the daily job expires it. North has a simple
 * programme (three levels) with six partners and last year still to close; South doesn't have the
 * module. With a faker of its own: the projects it adds to SHLTR's orders are fixed, so the rest of
 * the demo data stays the same.
 */
import { en, Faker, nl } from "@faker-js/faker";

import { formatCode } from "#lib/numbering.ts";
import { DAY, now } from "#lib/server/db/seed/clock.ts";
import { defineSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";
import { toDay, toMoment } from "#lib/server/db/seed/temporal.ts";
import { seedCreditNote } from "#modules/invoices/api/seed.ts";

import {
	bonusLineSource,
	creditValidUntil,
	defaultCategoryRules,
	defaultTiers,
	type Eligibility,
	figuresFrom,
	type RevenueCategory,
	type Tier,
} from "../model.ts";
import {
	bonusCreditNote,
	bonusYear,
	orderClassification,
	partnerAccount,
	programmeYear,
	walletEntry,
} from "./schema.ts";

/** North's simple programme: three levels, in euros' cents and basis points. */
const northTiers: Tier[] = [
	{ threshold: 100_000, level: "BRONS", cashRate: 200, creditRate: 250 },
	{ threshold: 500_000, level: "ZILVER", cashRate: 300, creditRate: 350 },
	{ threshold: 1_500_000, level: "GOUD", cashRate: 400, creditRate: 500 },
];

const thisYear = now.getFullYear();
const lastYear = thisYear - 1;

/** A day of a year, but never after today (the demo is relative to when it's seeded). */
const dayOf = (year: number, month: number, date: number) => {
	const day = new Date(year, month - 1, date);
	return day > now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : day;
};

/** A partner as `generate()` picks it: its customer (draft id) and its story. */
interface SeedPartner {
	customerId: number;
	acceptedOn: Date;
	/** Last year's figures as closed (cents), or none: not closed, or not a partner then. */
	closed?: { revenue: number; bonusRevenue: number; choice: "cash" | "credit" | null };
	/** Credit of the year before last, and what was spent of it (cents). */
	older?: { credit: number; spent: number };
	/** What was spent of last year's credit, with what for. */
	spends?: { amount: number; note: string; on: Date }[];
	/** Last year's cash bonus was paid out as a credit note (the invoicing module's), refunded since. */
	creditNote?: boolean;
}

/** What `generate()` makes for a tenant. */
interface PartnersSeed {
	tiers: Tier[];
	partners: SeedPartner[];
	/** Orders' classifications, by draft order id. */
	classifications: {
		orderId: number;
		category: RevenueCategory | null;
		eligibility: Eligibility | null;
		share: number | null;
	}[];
}

/** The customers with the most invoiced work, busiest first (the likeliest partners). */
function busiest(draft: TenantDraft, except: Set<number>, count: number) {
	const hours = new Map<number, number>();
	for (const o of draft.orders) {
		if (o.status !== "invoiced" || except.has(o.customerId)) continue;
		hours.set(o.customerId, (hours.get(o.customerId) ?? 0) + o.laborHours);
	}
	return [...hours]
		.sort((a, b) => b[1] - a[1] || a[0] - b[0])
		.slice(0, count)
		.map(([id]) => id);
}

/**
 * Riedel's projects this year: three large jobs, completed and invoiced well before today (so
 * they're paid), about € 130.000 together. Added to the draft, numbered after its orders.
 */
function riedelProjects(draft: TenantDraft, customerId: number) {
	const units = draft.equipments.filter((e) => e.customerId === customerId).map((e) => e.id);
	const engineer = draft.engineers.find((e) => e.active) ?? draft.engineers[0];
	const projects = [
		{ daysAgo: 220, euros: 46_000, description: "Project: vervanging 8 overheaddeuren hal 3" },
		{ daysAgo: 165, euros: 41_500, description: "Project: nieuwe docklevellers expeditie noord" },
		{ daysAgo: 110, euros: 42_500, description: "Project: snelloopdeuren koelcel en vriescel" },
	];
	const start = new Date(thisYear, 0, 12, 8);
	return projects.map((project, i) => {
		const id = draft.orders.length + i + 1;
		const done = new Date(Math.max(start.getTime(), now.getTime() - project.daysAgo * DAY));
		const completedAt = new Date(done.getFullYear(), done.getMonth(), done.getDate(), 16);
		const scheduledFor = new Date(completedAt.getTime() - 3 * DAY);
		const createdAt = new Date(scheduledFor.getTime() - 30 * DAY);
		return {
			id,
			number: formatCode("order", id, createdAt.getFullYear()),
			customerId,
			equipmentIds: units.slice(i * 2, i * 2 + 2),
			engineerId: engineer.id,
			type: "project" as const,
			status: "invoiced" as const,
			priority: "normal" as const,
			description: project.description,
			scheduledFor,
			completedAt,
			laborHours: Math.round((project.euros * 100) / engineer.hourlyRate),
			createdAt,
		};
	});
}

function shltrPartners(draft: TenantDraft, random: Faker): PartnersSeed {
	const byName = (name: string) => draft.customers.find((c) => c.name === name)?.id;
	const named = [
		"Riedel B.V.",
		"Weggemans Logistiek",
		"Vermeer Logistiek",
		"Pakhuis 7",
		"Bouwgroep De Vries",
		"Van Dijk Koeltechniek",
	].map(byName);
	const [riedel, weggemans, vermeer, pakhuis, bouwgroep, vanDijk] = named;
	const known = new Set(named.filter((id) => id !== undefined));
	const others = busiest(draft, known, 12 - known.size);

	const projects = riedel ? riedelProjects(draft, riedel) : [];
	draft.orders.push(...projects);

	const partners: SeedPartner[] = [];
	if (riedel) {
		partners.push({
			customerId: riedel,
			acceptedOn: new Date(lastYear - 1, 2, 4),
			// GOLD+ last year: 4,3 % of € 87.209,30 is the € 3.750 in its wallet.
			closed: { revenue: 18_240_000, bonusRevenue: 8_720_930, choice: "credit" },
			spends: [
				{
					amount: 100_000,
					note: "Veerset en kabels SD-005 (bestelling SH-2026-007)",
					on: dayOf(thisYear, 4, 9),
				},
				{
					amount: 47_500,
					note: "Filterset airco kantoor Ede (bestelling SH-2026-011)",
					on: dayOf(thisYear, 8, 21),
				},
			],
		});
	}
	if (weggemans) {
		partners.push({
			customerId: weggemans,
			acceptedOn: new Date(lastYear - 1, 8, 16),
			closed: { revenue: 12_150_000, bonusRevenue: 9_480_000, choice: "cash" },
			creditNote: true,
		});
	}
	if (vermeer) {
		partners.push({
			customerId: vermeer,
			acceptedOn: new Date(lastYear - 2, 4, 2),
			closed: { revenue: 8_320_000, bonusRevenue: 6_900_000, choice: "credit" },
			older: { credit: 120_000, spent: 80_000 },
			spends: [{ amount: 35_000, note: "Rubberafdichtingen docks 1–4", on: dayOf(thisYear, 6, 3) }],
		});
	}
	if (pakhuis) {
		partners.push({
			customerId: pakhuis,
			acceptedOn: new Date(lastYear, 1, 20),
			// Closed, the choice still to make.
			closed: { revenue: 6_410_000, bonusRevenue: 5_250_000, choice: null },
		});
	}
	if (bouwgroep) {
		partners.push({
			customerId: bouwgroep,
			acceptedOn: new Date(lastYear, 9, 1),
			closed: { revenue: 2_870_000, bonusRevenue: 1_900_000, choice: null },
		});
	}
	// New this year: nothing closed yet.
	if (vanDijk) partners.push({ customerId: vanDijk, acceptedOn: dayOf(thisYear, 3, 11) });
	for (const customerId of others) {
		const revenue = random.number.int({ min: 45_000, max: 260_000 }) * 100;
		const bonusRevenue = Math.round(revenue * random.number.float({ min: 0.4, max: 0.9 }));
		const choice = random.helpers.arrayElement(["cash", "credit", "credit"] as const);
		partners.push({
			customerId,
			acceptedOn: random.date.between({
				from: new Date(lastYear - 2, 0, 1),
				to: new Date(lastYear, 5, 30),
			}),
			closed: { revenue, bonusRevenue, choice },
			spends:
				choice === "credit" && random.datatype.boolean(0.5)
					? [
							{
								amount: random.number.int({ min: 2, max: 9 }) * 5_000,
								note: random.helpers.arrayElement([
									"Afstandsbedieningen en zenders",
									"Veerset sectionaaldeur",
									"Fotocellen en lichtscherm",
								]),
								on: dayOf(thisYear, random.number.int({ min: 2, max: 9 }), 14),
							},
						]
					: undefined,
		});
	}

	// How the partners' orders count: Riedel's projects for the level only (as agreed), Bouwgroep De
	// Vries' projects half, Weggemans' latest installation a tender, one partner's survey a special
	// project price in full, and a few installations of others regular parts.
	const classifications: PartnersSeed["classifications"] = projects.map((project) => ({
		orderId: project.id,
		category: null,
		eligibility: "level_only",
		share: null,
	}));
	const ordersOf = (customerId: number | undefined, type: string) =>
		draft.orders.filter((o) => o.customerId === customerId && o.type === type);
	for (const o of ordersOf(bouwgroep, "project")) {
		classifications.push({ orderId: o.id, category: null, eligibility: "partial", share: 50 });
	}
	const tender = ordersOf(weggemans, "installation").at(-1);
	if (tender) {
		classifications.push({
			orderId: tender.id,
			category: "tenders",
			eligibility: null,
			share: null,
		});
	}
	const special = ordersOf(pakhuis, "survey").at(-1);
	if (special) {
		classifications.push({
			orderId: special.id,
			category: "special_project_prices",
			eligibility: "full",
			share: null,
		});
	}
	for (const customerId of others.slice(0, 3)) {
		const installation = ordersOf(customerId, "installation").at(-1);
		if (installation) {
			classifications.push({
				orderId: installation.id,
				category: "regular_parts",
				eligibility: null,
				share: null,
			});
		}
	}
	return { tiers: defaultTiers, partners, classifications };
}

function northPartners(draft: TenantDraft): PartnersSeed {
	const partners = busiest(draft, new Set(), 6).map((customerId, i) => ({
		customerId,
		acceptedOn: new Date(lastYear, 2 + i, 1),
	}));
	// A project of one partner for the level only.
	const project = draft.orders.find(
		(o) => o.type === "project" && partners.some((p) => p.customerId === o.customerId),
	);
	return {
		tiers: northTiers,
		partners,
		classifications: project
			? [{ orderId: project.id, category: null, eligibility: "level_only", share: null }]
			: [],
	};
}

export default defineSeed<PartnersSeed>({
	clear: async (tx) => {
		await tx.delete(bonusCreditNote);
		await tx.delete(walletEntry);
		await tx.delete(bonusYear);
		await tx.delete(orderClassification);
		await tx.delete(partnerAccount);
		await tx.delete(programmeYear);
	},

	generate(draft, previous) {
		const random = new Faker({ locale: [nl, en] });
		random.seed(20_261_017 + previous.length);
		return draft.profile === "shltr" ? shltrPartners(draft, random) : northPartners(draft);
	},

	async run({ tx, tenants, insertAll, count }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const { tiers, partners, classifications } = tenant.data;
			const customerId = (id: number) => tenant.customerIds[id - 1];

			const years = [lastYear, thisYear].map((year) => ({
				organizationId,
				year,
				tiers,
				categories: defaultCategoryRules,
				creditValidYears: 1,
				createdAt: toMoment(new Date(year - 1, 11, 1, 9)),
			}));
			await tx.insert(programmeYear).values(years);
			count("partnerProgrammeYears", years);

			const accounts = partners.map((partner) => ({
				organizationId,
				customerId: customerId(partner.customerId),
				acceptedOn: toDay(partner.acceptedOn),
				createdAt: toMoment(partner.acceptedOn),
			}));
			await insertAll(accounts, (chunk) => tx.insert(partnerAccount).values(chunk));
			count("partnerAccounts", accounts);

			const classified = classifications.map((row) => ({
				...row,
				organizationId,
				orderId: tenant.orderIds[row.orderId - 1],
			}));
			await insertAll(classified, (chunk) => tx.insert(orderClassification).values(chunk));
			count("partnerClassifications", classified);

			// The closed years, and the wallets that follow from their choices.
			const entries: (typeof walletEntry.$inferInsert)[] = [];
			const payouts: (typeof bonusCreditNote.$inferInsert)[] = [];
			let closedYears = 0;
			for (const partner of partners) {
				const customer = customerId(partner.customerId);
				if (partner.older) {
					const year = lastYear - 1;
					const figures = figuresFrom(tiers, 7_500_000, { cash: 3_000_000, credit: 3_000_000 });
					const [older] = await tx
						.insert(bonusYear)
						.values({
							organizationId,
							customerId: customer,
							year,
							status: "finalised",
							partnerRevenue: figures.partnerRevenue,
							bonusRevenueCash: figures.bonusRevenue.cash,
							bonusRevenueCredit: figures.bonusRevenue.credit,
							level: figures.level?.level ?? null,
							cashRate: figures.level?.cashRate ?? null,
							creditRate: figures.level?.creditRate ?? null,
							cashAmount: figures.bonus.cash,
							creditAmount: partner.older.credit,
							creditValidUntil: creditValidUntil(year, 1),
							finalisedAt: toMoment(new Date(year + 1, 0, 14, 10)),
							choice: "credit",
							chosenAt: toMoment(new Date(year + 1, 1, 2, 11)),
						})
						.returning({ id: bonusYear.id });
					closedYears++;
					entries.push(
						{
							organizationId,
							customerId: customer,
							bonusYearId: older.id,
							kind: "award",
							amount: partner.older.credit,
							validUntil: creditValidUntil(year, 1),
							note: `Parts Credit over ${year}`,
							createdAt: toMoment(new Date(year + 1, 1, 2, 11)),
						},
						{
							organizationId,
							customerId: customer,
							kind: "spend",
							amount: -partner.older.spent,
							note: "Bedieningskasten docks 5–8",
							createdAt: toMoment(new Date(year + 1, 5, 18, 14)),
						},
					);
				}
				if (!partner.closed) continue;
				const { revenue, bonusRevenue, choice } = partner.closed;
				const figures = figuresFrom(tiers, revenue, { cash: bonusRevenue, credit: bonusRevenue });
				const validUntil = creditValidUntil(lastYear, 1);
				const chosenAt = new Date(thisYear, 1, 3 + closedYears, 10);
				const [closed] = await tx
					.insert(bonusYear)
					.values({
						organizationId,
						customerId: customer,
						year: lastYear,
						status: "finalised",
						partnerRevenue: figures.partnerRevenue,
						bonusRevenueCash: figures.bonusRevenue.cash,
						bonusRevenueCredit: figures.bonusRevenue.credit,
						level: figures.level?.level ?? null,
						cashRate: figures.level?.cashRate ?? null,
						creditRate: figures.level?.creditRate ?? null,
						cashAmount: figures.bonus.cash,
						creditAmount: figures.bonus.credit,
						creditValidUntil: validUntil,
						finalisedAt: toMoment(new Date(thisYear, 0, 15, 10)),
						choice: figures.level ? choice : null,
						chosenAt: figures.level && choice ? toMoment(chosenAt) : null,
					})
					.returning({ id: bonusYear.id });
				closedYears++;
				if (choice === "cash" && partner.creditNote && figures.level && figures.bonus.cash) {
					// Paid out as a credit note the day after the choice, refunded two weeks later.
					const issued = new Date(chosenAt.getTime() + DAY);
					const settled = new Date(issued.getTime() + 14 * DAY);
					const payout = await seedCreditNote(tx, {
						organizationId,
						customerId: customer,
						reason: `Partner Bonus ${lastYear}`,
						status: settled < now ? "paid" : "sent",
						issuedOn: toDay(issued),
						settledOn: settled < now ? toDay(settled) : null,
						createdAt: toMoment(issued),
						lines: [
							{
								description: `Cash Bonus ${lastYear}`,
								detail: figures.level.level,
								amount: figures.bonus.cash,
								source: bonusLineSource(closed.id),
							},
						],
					});
					payouts.push({
						organizationId,
						bonusYearId: closed.id,
						creditNoteId: payout.id,
						createdAt: toMoment(issued),
					});
				}
				if (choice !== "credit" || !figures.bonus.credit) continue;
				entries.push({
					organizationId,
					customerId: customer,
					bonusYearId: closed.id,
					kind: "award",
					amount: figures.bonus.credit,
					validUntil,
					note: `Parts Credit over ${lastYear}`,
					createdAt: toMoment(chosenAt),
				});
				for (const spend of partner.spends ?? []) {
					entries.push({
						organizationId,
						customerId: customer,
						kind: "spend",
						amount: -Math.min(spend.amount, figures.bonus.credit),
						note: spend.note,
						createdAt: toMoment(spend.on > chosenAt ? spend.on : chosenAt),
					});
				}
			}
			await insertAll(entries, (chunk) => tx.insert(walletEntry).values(chunk));
			await insertAll(payouts, (chunk) => tx.insert(bonusCreditNote).values(chunk));
			count("partnerBonusYears", Array.from({ length: closedYears }));
			count("walletEntries", entries);
			count("partnerBonusCreditNotes", payouts);
		}
	},
});
