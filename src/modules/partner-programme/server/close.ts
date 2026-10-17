/**
 * Closing a year (`partner_bonus_year`): its figures for each partner are frozen as they are, with
 * the level and the bonus in both forms, and the partner then chooses one of them, once. Credit
 * goes into the wallet as an award, valid until the year's date; cash is the amount to pay out,
 * recorded on the year (paid outside the app: invoicing has no credit notes yet). The office makes
 * the choice for now; a customer portal will call `chooseBonus()` the same way.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, desc, eq, isNull } from "drizzle-orm";

import { formatCents } from "#lib/i18n/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";

import { formatEuros } from "../display.ts";
import { partnerLabels } from "../labels.ts";
import { type BonusForm, creditValidUntil, isClosable } from "../model.ts";
import { customerSubject, figuresOf, partnersOf, today } from "./partners.ts";
import { rulesFor } from "./rules.ts";
import { bonusYear } from "./schema.ts";
import { addEntry } from "./wallet.ts";

/** The closed years of the tenant's partners in `year`, by customer id. */
async function closedIn(year: number, tx: Transaction | typeof db = db) {
	const rows = await tx
		.select()
		.from(bonusYear)
		.where(and(inTenant(bonusYear), eq(bonusYear.year, year)));
	return new Map(rows.map((row) => [row.customerId, row]));
}

/**
 * What closing `year` would freeze: every partner accepted by its end, with its figures now, and
 * the ones closed already as they were closed. None without rules for the year.
 */
export async function closePreview(year: number, tx: Transaction | typeof db = db) {
	const rules = await rulesFor(year, tx);
	const partners = await partnersOf(year, tx);
	const closed = await closedIn(year, tx);
	const figures = rules
		? await figuresOf(
				rules,
				partners.map((partner) => partner.id),
			)
		: new Map();
	return {
		year,
		rules: rules ?? null,
		closable: isClosable(year, today()),
		partners: partners.map((partner) => ({
			...partner,
			figures: figures.get(partner.id) ?? null,
			closed: closed.get(partner.id) ?? null,
		})),
	};
}

/** The closed year's subject in the activity log: `CUST-0001 · 2025`. */
const yearSubject = (row: { id: number; year: number }, code: string) => ({
	type: "partner_bonus_year",
	id: row.id,
	label: `${code} · ${row.year}`,
});

/**
 * Closes `year` for the tenant's partners accepted by its end (or the one with `customerId`) that
 * it isn't closed for yet, in one transaction: their figures as they are now, frozen. Refused while
 * the year runs, or without rules for it. Answers how many it closed.
 */
export async function closeYear(year: number, customerId?: number): Promise<number> {
	if (!isClosable(year, today())) invalid(m.partners_close_not_over({ year: String(year) }));
	return db.transaction(async (tx) => {
		const preview = await closePreview(year, tx);
		if (!preview.rules) invalid(m.partners_no_rules({ year: String(year) }));
		const open = preview.partners.filter(
			(partner) => !partner.closed && (customerId === undefined || partner.id === customerId),
		);
		if (customerId !== undefined && !open.length) invalid(m.partners_close_nothing());
		const validUntil = creditValidUntil(year, preview.rules.creditValidYears);
		const finalisedAt = Temporal.Now.instant();
		for (const partner of open) {
			const figures = partner.figures!;
			const [row] = await tx
				.insert(bonusYear)
				.values({
					organizationId: currentTenant().organizationId,
					customerId: partner.id,
					year,
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
					finalisedAt,
				})
				.returning({ id: bonusYear.id, year: bonusYear.year });
			await recordActivity(tx, {
				action: "finalised",
				subject: yearSubject(row, partner.code),
				parent: customerSubject(partner),
				note: m.partners_close_note({
					level: figures.level?.level ?? m.partners_no_level(),
					revenue: formatEuros(figures.partnerRevenue),
					cash: formatCents(figures.bonus.cash),
					credit: formatCents(figures.bonus.credit),
				}),
			});
		}
		return open.length;
	});
}

/** A partner's closed years, latest first. */
export async function closedYearsOf(customerId: number) {
	return db
		.select()
		.from(bonusYear)
		.where(and(inTenant(bonusYear), eq(bonusYear.customerId, customerId)))
		.orderBy(desc(bonusYear.year));
}

/**
 * Records the partner's choice for a closed year, once and for good: credit goes into its wallet
 * (an award valid until the year's date), cash is recorded as the amount to pay out. Refused for a
 * year that isn't closed, that was chosen for already, or that has no bonus. The seam for the
 * customer portal, which will let the partner choose itself.
 */
export async function chooseBonus(customerId: number, year: number, choice: BonusForm) {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ closed: bonusYear, code: customer.code })
			.from(bonusYear)
			.innerJoin(...tenantJoin(customer, bonusYear.customerId))
			.where(
				and(inTenant(bonusYear), eq(bonusYear.customerId, customerId), eq(bonusYear.year, year)),
			);
		if (!row) error(404, m.partners_year_not_closed({ year: String(year) }));
		const { closed, code } = row;
		if (closed.choice) invalid(m.partners_choice_made());
		const amount = choice === "cash" ? closed.cashAmount : closed.creditAmount;
		if (!amount) invalid(m.partners_choice_nothing());
		// Only if no one chose in the meantime: the choice can't be changed.
		const chosen = await tx
			.update(bonusYear)
			.set({ choice, chosenAt: Temporal.Now.instant() })
			.where(and(idInTenant(bonusYear, closed.id), isNull(bonusYear.choice)))
			.returning({ id: bonusYear.id });
		if (!chosen.length) invalid(m.partners_choice_made());
		const holder = { id: customerId, code };
		await recordActivity(tx, {
			action: "chosen",
			subject: yearSubject(closed, code),
			parent: customerSubject(holder),
			note: m.partners_choice_note({
				form: partnerLabels.label("bonusForm", choice),
				amount: formatCents(amount),
			}),
		});
		if (choice === "credit") {
			await addEntry(
				tx,
				holder,
				{
					kind: "award",
					amount,
					validUntil: closed.creditValidUntil,
					bonusYearId: closed.id,
					note: m.partners_award_note({ year: String(year) }),
				},
				today(),
			);
		}
	});
}
