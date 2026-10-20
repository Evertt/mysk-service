/**
 * The invoices module's demo data for the seeds of the modules that require it: a standalone
 * credit note that another module's demo pays out with (the partner programme's cash bonus), next
 * in the tenant's series after the ones invoicing seeded (its seed runs first, see
 * `#lib/server/db/seed/module-seed.ts`). Plain Node, like the seed.
 */
import { sql, eq } from "drizzle-orm";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import type { SeedTransaction } from "#lib/server/db/seed/module-seed.ts";

import { typedCreditLine } from "../credit-note.ts";
import { creditNoteNumberFormat } from "../model.ts";
import { creditNote, creditNoteLine } from "../server/schema.ts";

/** A standalone credit note for the demo; days and moments as the seed's database has them. */
export interface SeedCreditNote {
	organizationId: string;
	/** The customer's id in the database. */
	customerId: number;
	reason: string;
	status: "draft" | "sent" | "paid";
	issuedOn: Temporal.PlainDate | null;
	settledOn: Temporal.PlainDate | null;
	createdAt: Temporal.Instant;
	/** What it credits, each as a positive amount in cents (before VAT), with the caller's reference. */
	lines: { description: string; detail?: string | null; amount: number; source?: string | null }[];
}

/** Inserts the credit note with the tenant's next number, at the demo's 21 % VAT; answers its id. */
export async function seedCreditNote(tx: SeedTransaction, note: SeedCreditNote) {
	const [last] = await tx
		.select({
			sequence: sql<
				number | null
			>`max(cast(substr(${creditNote.number}, ${sequenceStart(creditNoteNumberFormat)}) as integer))`,
		})
		.from(creditNote)
		.where(eq(creditNote.organizationId, note.organizationId));
	const year = (note.issuedOn ?? note.createdAt.toZonedDateTimeISO("Europe/Amsterdam")).year;
	const number = formatCode(creditNoteNumberFormat, (last?.sequence ?? 0) + 1, year);
	const [created] = await tx
		.insert(creditNote)
		.values({
			organizationId: note.organizationId,
			number,
			customerId: note.customerId,
			invoiceId: null,
			status: note.status,
			vatRate: 21,
			reason: note.reason,
			issuedOn: note.issuedOn,
			settledOn: note.settledOn,
			createdAt: note.createdAt,
		})
		.returning({ id: creditNote.id });
	await tx.insert(creditNoteLine).values(
		note.lines.map((line) => ({
			...typedCreditLine({ ...line, quantity: 1, unitPrice: line.amount }),
			organizationId: note.organizationId,
			creditNoteId: created.id,
		})),
	);
	return { id: created.id, number };
}
