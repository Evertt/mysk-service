/**
 * A partner's wallet (`partner_wallet_entry`): its ledger, what it holds (`walletSummary()`), the
 * entries the office adds by hand, and the daily job that expires credit past its date. Every
 * entry is logged against the customer, and keeps what's left of the credit it brought in
 * (`remaining`), so SQL adds up what's available (`creditAvailableOn()`).
 */
import { invalid } from "@sveltejs/kit";
import { and, asc, gte, isNull, or, sql } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { dayOf } from "#lib/dates.ts";
import { formatCents, formatDate } from "#lib/i18n/index.ts";
import type { DailyReport, DailyRun } from "#lib/jobs/extensions.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer } from "#lib/server/db/schema.ts";

import { creditLeft, type WalletEntryKind, walletSummary } from "../model.ts";
import { walletEntry } from "./schema.ts";

/** A wallet entry as stored, with the day it was made (`on`, in the user's zone). */
type LedgerEntry = typeof walletEntry.$inferSelect & { on: Temporal.PlainDate };

const withDay = (row: typeof walletEntry.$inferSelect): LedgerEntry => ({
	...row,
	on: dayOf(row.createdAt),
});

/** The day of a moment an entry was made, in the user's zone (outside a request, the runtime's). */

/**
 * Of the entries' credit, the part that can be spent on `today` (the credit still valid), as a
 * condition: what's left of it (`remaining`) adds up to what `walletSummary()` says is available.
 */
export const creditAvailableOn = (today: Temporal.PlainDate) =>
	or(isNull(walletEntry.validUntil), gte(walletEntry.validUntil, today))!;

/**
 * Stores what's left of each credit of a partner's ledger (all its entries, in order) as replaying
 * it says (`creditLeft()`), where it changed: after each entry, in its transaction.
 */
async function keepCreditLeft(tx: Transaction, entries: readonly LedgerEntry[]) {
	const left = creditLeft(entries);
	for (const entry of entries) {
		const remaining = left.get(entry.id) ?? 0;
		if (remaining === entry.remaining) continue;
		await tx.update(walletEntry).set({ remaining }).where(idInTenant(walletEntry, entry.id));
	}
}

/** The customers' wallet entries, in the order they were made, by customer id. */
async function walletEntries(customerIds: readonly number[], tx: Transaction | typeof db = db) {
	const byCustomer = new Map<number, LedgerEntry[]>(customerIds.map((id) => [id, []]));
	if (!customerIds.length) return byCustomer;
	const rows = await tx
		.select()
		.from(walletEntry)
		.where(and(inTenant(walletEntry), inList(walletEntry.customerId, [...customerIds])))
		.orderBy(asc(walletEntry.id));
	for (const row of rows) byCustomer.get(row.customerId)?.push(withDay(row));
	return byCustomer;
}

/** A partner's wallet entries, in the order they were made. */
export const ledgerOf = async (customerId: number, tx: Transaction | typeof db = db) =>
	(await walletEntries([customerId], tx)).get(customerId)!;

/** A partner's wallet on `today`: what it holds, and its latest entries (newest first). */
export async function walletOf(
	customerId: number,
	today: Temporal.PlainDate,
	tx: Transaction | typeof db = db,
) {
	const entries = (await walletEntries([customerId], tx)).get(customerId)!;
	return { ...walletSummary(entries, today), entries: entries.toReversed().slice(0, 12) };
}

/** A partner as an entry is made for it. */
interface Holder {
	id: number;
	code: string;
}

/** An entry to add: its amount signed, in cents. */
export interface NewEntry {
	kind: WalletEntryKind;
	amount: number;
	validUntil?: Temporal.PlainDate | null;
	bonusYearId?: number | null;
	note?: string | null;
}

/**
 * Adds an entry to a partner's wallet in `tx`, and logs it against the customer. What goes out
 * must be there: an amount taken (other than an expiry, which takes what's past its date) is
 * refused beyond what's available on `today`, so the balance never goes below zero. Keeps what's
 * left of each credit after it (`keepCreditLeft()`): which credit it took, or gave back to.
 */
export async function addEntry(
	tx: Transaction,
	holder: Holder,
	entry: NewEntry,
	today: Temporal.PlainDate,
) {
	const entries = (await walletEntries([holder.id], tx)).get(holder.id)!;
	if (entry.amount < 0 && entry.kind !== "expiry") {
		const { available } = walletSummary(entries, today);
		if (-entry.amount > available) {
			invalid(m.partners_wallet_not_enough({ available: formatCents(available) }));
		}
	}
	const [added] = await tx
		.insert(walletEntry)
		.values({
			organizationId: currentTenant().organizationId,
			customerId: holder.id,
			kind: entry.kind,
			amount: entry.amount,
			validUntil: entry.validUntil ?? null,
			bonusYearId: entry.bonusYearId ?? null,
			note: entry.note ?? null,
		})
		.returning();
	await keepCreditLeft(tx, [...entries, withDay(added)]);
	await recordActivity(tx, {
		action: "created",
		subject: { type: "partner_wallet_entry", id: added.id, label: holder.code },
		parent: customerSubject(holder),
		before: {},
		after: { kind: entry.kind, amount: entry.amount },
		note: entry.note,
	});
	return added.id;
}

/**
 * The daily job (`jobs.daily`): writes an `expiry` entry for the credit of each of the tenant's
 * wallets that's past its date and still there, each wallet in a transaction of its own. Safe to
 * run again: once expired, nothing of that credit is left to expire.
 */
export async function expireCredit({ today }: DailyRun): Promise<DailyReport> {
	const holders = await db
		.selectDistinct({ id: customer.id, code: customer.code })
		.from(walletEntry)
		.innerJoin(...tenantJoin(customer, walletEntry.customerId))
		.where(inTenant(walletEntry))
		.orderBy(asc(customer.id));
	let expired = 0;
	for (const holder of holders) {
		expired += await db.transaction(async (tx) => {
			const entries = (await walletEntries([holder.id], tx)).get(holder.id)!;
			const { expired: lots } = walletSummary(entries, today);
			for (const lot of lots) {
				await addEntry(
					tx,
					holder,
					{
						kind: "expiry",
						amount: -lot.amount,
						validUntil: lot.validUntil,
						bonusYearId: lot.bonusYearId,
						note: m.partners_wallet_expired_note({ date: formatDate(lot.validUntil) }),
					},
					today,
				);
			}
			return lots.length;
		});
	}
	return expired ? { "partner-programme.expired": expired } : {};
}

/** The tenant's wallets' credit that can be spent on `today`, added up. */
export async function outstandingCredit(today: Temporal.PlainDate) {
	const [row] = await db
		.select({ total: sql<number>`coalesce(sum(${walletEntry.remaining}), 0)` })
		.from(walletEntry)
		.where(and(inTenant(walletEntry), creditAvailableOn(today)));
	return row.total;
}
