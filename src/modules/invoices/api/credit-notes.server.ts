/**
 * Credit notes for the modules that require invoicing (the partner programme's cash bonus): making
 * a standalone one in the caller's transaction, and reading where some stand. They follow the
 * invoicing module's rules (`../credit-note.ts`): a draft with the next number, at the
 * organization's VAT rate, logged, that the office issues and settles on its page. Server-only.
 */
import { and, eq, sql } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { creditTotals, typedCreditLine } from "../credit-note.ts";
import type { InvoiceStatus } from "../model.ts";
import { createStandalone } from "../server/credit-notes.ts";
import { creditNote, creditNoteLine } from "../server/schema.ts";

/** A standalone credit note to make. */
export interface CreditNoteDraft {
	customerId: number;
	/** Why, e.g. "Partner Bonus 2025"; printed on it. */
	reason: string;
	/** What it credits, each as a positive amount in cents (before VAT). */
	lines: {
		description: string;
		detail?: string | null;
		amount: number;
		/** The caller's reference, e.g. `partner-programme:bonus:12`, kept on the line. */
		source?: string | null;
	}[];
	/** A record of the caller's whose activity card shows its creation too. */
	parent?: { type: string; id: number | string; label: string };
}

/**
 * Makes a draft standalone credit note for one of the tenant's customers in `tx`, the caller's
 * transaction; a 404 for a customer that isn't the tenant's. Answers its id and number.
 */
export function createCreditNote(tx: Transaction, draft: CreditNoteDraft) {
	return createStandalone(tx, {
		customerId: draft.customerId,
		reason: draft.reason,
		parent: draft.parent,
		lines: draft.lines.map((line) =>
			typedCreditLine({
				description: line.description,
				detail: line.detail,
				quantity: 1,
				unitPrice: line.amount,
				source: line.source,
			}),
		),
	});
}

/** Where a credit note stands, for another module to show it. */
export interface CreditNoteStatus {
	id: number;
	number: string;
	status: InvoiceStatus;
	issuedOn: Temporal.PlainDate | null;
	settledOn: Temporal.PlainDate | null;
	/** Including VAT, negative. */
	total: number;
}

/** The tenant's credit notes with these ids, by id (another tenant's aren't in it). */
export async function creditNotesOf(
	ids: readonly number[],
): Promise<Map<number, CreditNoteStatus>> {
	if (!ids.length) return new Map();
	const rows = await db
		.select({
			id: creditNote.id,
			number: creditNote.number,
			status: creditNote.status,
			issuedOn: creditNote.issuedOn,
			settledOn: creditNote.settledOn,
			vatRate: creditNote.vatRate,
			subtotal: sql<number>`coalesce(sum(${creditNoteLine.amount}), 0)`,
		})
		.from(creditNote)
		.leftJoin(
			creditNoteLine,
			and(eq(creditNoteLine.creditNoteId, creditNote.id), inTenant(creditNoteLine)),
		)
		.where(and(inTenant(creditNote), inList(creditNote.id, [...ids])))
		.groupBy(creditNote.id);
	return new Map(
		rows.map(({ vatRate, subtotal, ...row }) => [
			row.id,
			{ ...row, total: creditTotals(subtotal, vatRate).total },
		]),
	);
}
