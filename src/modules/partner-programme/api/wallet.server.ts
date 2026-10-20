import { and, eq } from "drizzle-orm";

/**
 * The partner programme's wallet, for the modules that require it (the parts shop): what a
 * partner can spend, spending it and giving a spend back, in the caller's transaction, through
 * the ledger's own rules (`addEntry()`: nothing goes out beyond what's available, every entry is
 * logged against the customer).
 */
import { currentDay } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

import { creditTaken } from "../model.ts";
import { partnerAccount } from "../server/schema.ts";
import { addEntry, ledgerOf, walletOf } from "../server/wallet.ts";

/** A partner as an entry is made for it: its customer. */
export interface WalletHolder {
	id: number;
	code: string;
}

/** Whether the tenant's customer `customerId` is a partner (accepted into the programme). */
export async function isPartner(customerId: number, tx: Transaction | typeof db = db) {
	const [row] = await tx
		.select({ id: partnerAccount.id })
		.from(partnerAccount)
		.where(and(inTenant(partnerAccount), eq(partnerAccount.customerId, customerId)));
	return !!row;
}

/** What the customer's wallet holds today (see `walletSummary()`), with its latest entries. */
export const walletToday = (customerId: number, tx: Transaction | typeof db = db) =>
	walletOf(customerId, currentDay(), tx);

/**
 * Takes `amount` (cents, more than zero) of the holder's credit in `tx`, as a `spend` with `note`
 * (stored in the language of whoever spends it), the credit that expires first first. Refused
 * (`Refused`) beyond what's available today, checked in the same transaction. Answers the entry's
 * id, to give it back by.
 */
export const spendCredit = (tx: Transaction, holder: WalletHolder, amount: number, note: string) =>
	addEntry(tx, holder, { kind: "spend", amount: -amount, note }, currentDay());

/**
 * Gives back what the spend `entryId` took of the holder's credit, in `tx`: a `reversal` for each
 * piece of credit it took (`creditTaken()`), with that credit's date and year, so credit that has
 * expired since comes back expired (and the daily job expires it again). Answers how much.
 */
export async function giveBackCredit(
	tx: Transaction,
	holder: WalletHolder,
	entryId: number,
	note: string,
) {
	const pieces = creditTaken(await ledgerOf(holder.id, tx), entryId);
	for (const piece of pieces) {
		await addEntry(
			tx,
			holder,
			{
				kind: "reversal",
				amount: piece.amount,
				validUntil: piece.validUntil,
				bonusYearId: piece.bonusYearId,
				note,
			},
			currentDay(),
		);
	}
	return pieces.reduce((sum, piece) => sum + piece.amount, 0);
}
