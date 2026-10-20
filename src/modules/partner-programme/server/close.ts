import { error, invalid } from "@sveltejs/kit";
import { and, desc, eq, isNull } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
/**
 * Closing a year (`partner_bonus_year`): its figures for each partner are frozen as they are, with
 * the level and the bonus in both forms, and the partner then chooses one of them, once. Credit
 * goes into the wallet as an award, valid until the year's date; cash is the amount to pay out,
 * recorded on the year, which the office pays out as a standalone credit note of the invoicing
 * module's (`payBonusByCreditNote()`, through its `api/credit-notes.server.ts`), or outside the app.
 * A manager makes the choice in the office, or the partner itself in the customer portal, both
 * through `chooseBonus()`.
 */
import { currentDay } from "#lib/dates.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { createCreditNote, creditNotesOf } from "#modules/invoices/api/credit-notes.server.ts";
import { creditNote } from "#modules/invoices/api/schema.server.ts";

import { formatEuros } from "../display.ts";
import { partnerLabels } from "../labels.ts";
import {
	type BonusForm,
	bonusLineSource,
	creditValidUntil,
	isClosable,
	levelColour,
} from "../model.ts";
import { figuresOf, partnersOf } from "./partners.ts";
import { programmeYears, rulesFor } from "./rules.ts";
import { bonusCreditNote, bonusYear } from "./schema.ts";
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
		closable: isClosable(year, currentDay()),
		partners: partners.map((partner) => ({
			...partner,
			figures: figures.get(partner.id) ?? null,
			closed: closed.get(partner.id) ?? null,
		})),
	};
}

/** The closed year's subject in the activity log: `CUST-0001 · 2025`. */
const yearSubject = (row: { id: number; year: number }, code: string): Subject => ({
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
	if (!isClosable(year, currentDay())) invalid(m.partners_close_not_over({ year: String(year) }));
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

/**
 * A partner's closed years, latest first, each with its level's colour (by the year's rules) and
 * the credit note its cash bonus is paid out with (where it stands), if there is one.
 */
export async function closedYearsOf(customerId: number) {
	const rows = await db
		.select({ year: bonusYear, creditNoteId: bonusCreditNote.creditNoteId })
		.from(bonusYear)
		.leftJoin(
			bonusCreditNote,
			and(eq(bonusCreditNote.bonusYearId, bonusYear.id), inTenant(bonusCreditNote)),
		)
		.where(and(inTenant(bonusYear), eq(bonusYear.customerId, customerId)))
		.orderBy(desc(bonusYear.year));
	const [notes, years] = await Promise.all([
		creditNotesOf(rows.flatMap((row) => row.creditNoteId ?? [])),
		programmeYears(),
	]);
	// A year goes by its own rules, else the latest before it's (`rulesFor()`).
	const tiersOf = (year: number) => years.find((rules) => rules.year <= year)?.tiers ?? [];
	return rows.map((row) => ({
		...row.year,
		colour: row.year.level ? levelColour(row.year.level, tiersOf(row.year.year)) : undefined,
		creditNote: (row.creditNoteId && notes.get(row.creditNoteId)) || null,
	}));
}

/**
 * Pays out a partner's cash bonus for a closed year as a standalone credit note (a draft, for the
 * office to issue): for the cash amount, the reason "Partner Bonus {year}", its line referring to
 * the year (`bonusLineSource()`, so the payout isn't taken off the partner's revenue), linked to the
 * year. Refused unless cash was chosen, or while a credit note that isn't void pays it already.
 * Answers the credit note's number.
 */
export async function payBonusByCreditNote(customerId: number, year: number) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				closed: bonusYear,
				code: customer.code,
				linked: bonusCreditNote.creditNoteId,
			})
			.from(bonusYear)
			.innerJoin(...tenantJoin(customer, bonusYear.customerId))
			.leftJoin(
				bonusCreditNote,
				and(eq(bonusCreditNote.bonusYearId, bonusYear.id), inTenant(bonusCreditNote)),
			)
			.where(
				and(inTenant(bonusYear), eq(bonusYear.customerId, customerId), eq(bonusYear.year, year)),
			);
		if (!row) error(404, m.partners_year_not_closed({ year: String(year) }));
		const { closed, code } = row;
		if (closed.choice !== "cash" || !closed.cashAmount) invalid(m.partners_credit_note_no_cash());
		if (row.linked) {
			const [linked] = await tx
				.select({ status: creditNote.status, number: creditNote.number })
				.from(creditNote)
				.where(and(eq(creditNote.id, row.linked), inTenant(creditNote)));
			if (linked && linked.status !== "void") {
				invalid(m.partners_credit_note_exists({ number: linked.number }));
			}
		}
		const holder = { id: customerId, code };
		const yearLabel = String(year);
		const made = await createCreditNote(tx, {
			customerId,
			// Stored, so in the language of whoever made it, like the lines.
			reason: m.partners_credit_note_reason({ year: yearLabel }),
			lines: [
				{
					description: m.partners_credit_note_line({ year: yearLabel }),
					detail: closed.level
						? m.partners_credit_note_detail({
								level: closed.level,
								revenue: formatEuros(closed.bonusRevenueCash),
							})
						: null,
					amount: closed.cashAmount,
					source: bonusLineSource(closed.id),
				},
			],
			parent: customerSubject(holder),
		});
		const organizationId = currentTenant().organizationId;
		await tx
			.insert(bonusCreditNote)
			.values({ organizationId, bonusYearId: closed.id, creditNoteId: made.id })
			.onConflictDoUpdate({
				target: [bonusCreditNote.organizationId, bonusCreditNote.bonusYearId],
				set: { creditNoteId: made.id, createdAt: Temporal.Now.instant() },
			});
		await recordActivity(tx, {
			action: "credited",
			subject: yearSubject(closed, code),
			parent: customerSubject(holder),
			note: m.partners_credit_note_note({
				number: made.number,
				amount: formatCents(closed.cashAmount),
			}),
		});
		return made;
	});
}

/**
 * Records the partner's choice for a closed year, once and for good: credit goes into its wallet
 * (an award valid until the year's date), cash is recorded as the amount to pay out. Refused for a
 * year that isn't closed, that was chosen for already, or that has no bonus. The office's card and
 * the customer portal (the partner's own choice) both call it.
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
				currentDay(),
			);
		}
	});
}
