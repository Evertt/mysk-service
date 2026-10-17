/**
 * A partner's figures and wallet, and what managers do with them: accept a customer into the
 * programme, close its last year, record its bonus choice and add to or take from its wallet.
 * Shared by the customer page's card (`slots/customers.detail.side/`) and the programme's pages.
 */
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { walletEntrySchema, yearField } from "./form/wallet-schema.ts";
import { bonusForms, creditValidUntil, isClosable } from "./model.ts";
import { forManagers, query } from "./remote-functions.ts";
import { chooseBonus, closedYearsOf, closeYear, payBonusByCreditNote } from "./server/close.ts";
import { acceptPartner as accept, customerByCode, figuresOf, today } from "./server/partners.ts";
import { rulesFor } from "./server/rules.ts";
import { addEntry, walletOf } from "./server/wallet.ts";

const code = v.pipe(v.string(), v.nonEmpty(), v.maxLength(64));

/**
 * The customer's place in the programme: whether it's a partner (and since when), this year's
 * figures so far, its closed years and its wallet. For a customer that isn't a partner, only that.
 */
export const getPartnerCard = query(code, async (customerCode) => {
	const found = await customerByCode(customerCode);
	const canManage = isManager(currentTenant().roles);
	const customer = { id: found.id, code: found.code, name: found.name };
	if (!found.partner) return { customer, partner: null, canManage };

	const now = today();
	const rules = await rulesFor(now.year);
	const figures = rules ? (await figuresOf(rules, [found.id])).get(found.id)! : null;
	const closed = await closedYearsOf(found.id);
	const wallet = await walletOf(found.id, now);
	// Last year, while it isn't closed for the partner (it was one by its end).
	const last = now.year - 1;
	const lastRules = await rulesFor(last);
	const closable =
		isClosable(last, now) &&
		!!lastRules &&
		Temporal.PlainDate.compare(found.partner.acceptedOn, new Temporal.PlainDate(last, 12, 31)) <=
			0 &&
		!closed.some((each) => each.year === last);
	return {
		customer,
		partner: found.partner,
		canManage,
		year: now.year,
		tiers: rules?.tiers ?? [],
		figures,
		/** Where this year's credit would be valid until, if it's chosen. */
		validUntil: rules ? creditValidUntil(now.year, rules.creditValidYears) : null,
		closed: closed.slice(0, 3),
		closable: closable ? last : null,
		wallet,
	};
});

/** Accepts the customer into the programme, today. */
export const acceptPartner = forManagers.form(v.object({ code }), async (input) => {
	await accept(input.code);
	void getPartnerCard(input.code).refresh();
});

/** Closes last year for the partner alone (the whole year is closed from the programme's pages). */
export const closePartnerYear = forManagers.form(
	v.object({ code, year: yearField }),
	async (input) => {
		const found = await customerByCode(input.code);
		await closeYear(input.year, found.id);
		void getPartnerCard(input.code).refresh();
	},
);

/** Records the partner's choice for a closed year: cash, or credit in its wallet. Once. */
export const choosePartnerBonus = forManagers.form(
	v.object({ code, year: yearField, choice: v.picklist(bonusForms) }),
	async (input) => {
		const found = await customerByCode(input.code);
		await chooseBonus(found.id, input.year, input.choice);
		void getPartnerCard(input.code).refresh();
	},
);

/**
 * Pays out the partner's cash bonus for a closed year as a draft credit note (the invoicing
 * module's), linked to the year. Answers its number, for the card to link to.
 */
export const createBonusCreditNote = forManagers.form(
	v.object({ code, year: yearField }),
	async (input) => {
		const found = await customerByCode(input.code);
		const made = await payBonusByCreditNote(found.id, input.year);
		void getPartnerCard(input.code).refresh();
		return { number: made.number };
	},
);

/**
 * Adds an entry to the partner's wallet by hand: credit spent outside the shop (taken from what's
 * available), or credit added, valid until the day given.
 */
export const addWalletEntry = forManagers.form(walletEntrySchema, async (input) => {
	const found = await customerByCode(input.code);
	const spend = input.kind === "spend";
	await db.transaction((tx) =>
		addEntry(
			tx,
			found,
			{
				kind: spend ? "spend" : "adjustment",
				amount: spend ? -input.amount : input.amount,
				validUntil: spend ? null : input.validUntil,
				note: input.note,
			},
			today(),
		),
	);
	void getPartnerCard(input.code).refresh();
});
