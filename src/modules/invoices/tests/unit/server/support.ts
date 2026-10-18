/**
 * What the invoicing module's server specs share: reading invoices, credit notes and their log
 * from the spec file's database, in SQL (so a check doesn't share the code it checks), and today
 * as the app has it.
 */
import { rows, value } from "#unit/lib/server/harness/index.ts";

/** Today in the seed's (and the harness's) time zone, as the database has days. */
export const today = () => Temporal.Now.plainDateISO("Europe/Amsterdam");

/** VAT on a subtotal at `rate` percent, rounded once, halves away from zero. */
export const vatOf = (subtotal: number, rate = 21) =>
	Math.sign(subtotal) * Math.round(Math.abs((subtotal * rate) / 100));

/** An invoice as stored, by its number in an organization. */
export const invoiceOf = (number: string, organizationId: string) =>
	rows<{
		id: number;
		number: string;
		status: string;
		customer_id: number;
		vat_rate: number;
		payment_term_days: number;
		notes: string | null;
		issued_on: string | null;
		due_on: string | null;
		paid_on: string | null;
		voided_at: number | null;
	}>(`select * from invoice where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]).then(([row]) => row);

/** An invoice's lines as stored, in order. */
export const linesOf = (invoiceId: number) =>
	rows<{
		id: number;
		description: string;
		detail: string | null;
		quantity: number;
		unit_price: number;
		amount: number;
		order_id: number | null;
		source: string | null;
	}>(`select * from invoice_line where invoice_id = ? order by id`, [invoiceId]);

/** A credit note as stored, by its number in an organization. */
export const creditOf = (number: string, organizationId: string) =>
	rows<{
		id: number;
		number: string;
		status: string;
		customer_id: number;
		invoice_id: number | null;
		vat_rate: number;
		reason: string;
		issued_on: string | null;
		settled_on: string | null;
		voided_at: number | null;
	}>(`select * from credit_note where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]).then(([row]) => row);

/** A credit note's lines as stored, in order. */
export const creditLinesOf = (creditNoteId: number) =>
	rows<{
		id: number;
		description: string;
		quantity: number;
		unit_price: number;
		amount: number;
		invoice_line_id: number | null;
		order_id: number | null;
	}>(`select * from credit_note_line where credit_note_id = ? order by id`, [creditNoteId]);

/** A record and its lines as stored, to check that a refused request changed nothing. */
export const invoiceSnapshot = async (id: number) => [
	await rows(`select * from invoice where id = ?`, [id]),
	await linesOf(id),
];
export const creditSnapshot = async (id: number) => [
	await rows(`select * from credit_note where id = ?`, [id]),
	await creditLinesOf(id),
];

/** An activity log entry, as the specs read it. */
export interface Entry {
	action: string;
	user_name: string;
	subject_type: string;
	subject_id: string;
	subject_label: string;
	parent_type: string | null;
	changes: string | null;
	note: string | null;
}

/** The log's entries about a record (as subject or parent), oldest first. */
export const activityAbout = (type: string, id: number, organizationId: string) =>
	rows<Entry>(
		`select action, user_name, subject_type, subject_id, subject_label, parent_type, changes, note
		 from activity where organization_id = ? and ((subject_type = ? and subject_id = ?)
		 or (parent_type = ? and parent_id = ?)) order by id`,
		[organizationId, type, String(id), type, String(id)],
	);

/** The name the log keeps for the account with `email`. */
export const nameOf = (email: string) =>
	value<string>(`select name from user where email = ?`, [email]);

/**
 * The highest sequence of a series in an organization: of `INV-<year>-<sequence>` (`invoice`) or
 * `CN-<year>-<sequence>` (`credit_note`), which run on across years.
 */
export const lastSequence = async (table: "invoice" | "credit_note", organizationId: string) =>
	Number(
		(await value<number | null>(
			`select max(cast(substr(number, ?) as integer)) from ${table} where organization_id = ?`,
			[table === "invoice" ? 10 : 9, organizationId],
		)) ?? 0,
	);

/** The sequence of a number, e.g. 7 of `INV-2026-00007`. */
export const sequenceOf = (number: string) => Number(number.split("-").at(-1));
