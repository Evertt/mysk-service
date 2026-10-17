/**
 * The partner programme as a partner's contact reads it in the customer portal
 * (`/partner-programme/portal` and the home page's card): this year's figures so far, the year's
 * levels and the revenue that counts, its closed years, its wallet, and its own choice between cash
 * and credit for a closed year. Gated by the module's set for customers and scoped to their
 * customer (`currentCustomer()`): another customer's figures or wallet are never in it, and a
 * customer that isn't a partner gets only that.
 */
import * as v from "valibot";

import { currentCustomer, currentTenant } from "#lib/server/auth/index.ts";

import { isPartner } from "../api/wallet.server.ts";
import { yearField } from "../form/wallet-schema.ts";
import { bonusForms, creditValidUntil } from "../model.ts";
import { forCustomers } from "../remote-functions.ts";
import { chooseBonus, closedYearsOf } from "../server/close.ts";
import { figuresOf, today } from "../server/partners.ts";
import { rulesFor } from "../server/rules.ts";
import { walletOf } from "../server/wallet.ts";

/**
 * The contact's customer's place in the programme: for a partner, this year's figures, the rules
 * they follow from, its last closed years (the latest one still waiting for its choice, if any)
 * and its wallet, and the programme's organization (the tenant, for the page's banner); for a
 * customer that isn't one, `partner: false` alone.
 */
export const getClientPartner = forCustomers.query(async () => {
	const { customer } = await currentCustomer();
	if (!(await isPartner(customer.id))) return { partner: false as const };
	const now = today();
	const rules = await rulesFor(now.year);
	const figures = rules ? (await figuresOf(rules, [customer.id])).get(customer.id)! : null;
	const closed = (await closedYearsOf(customer.id)).slice(0, 3).map((year) => ({
		year: year.year,
		level: year.level,
		partnerRevenue: year.partnerRevenue,
		bonusRevenue: year.bonusRevenueCredit,
		cashAmount: year.cashAmount,
		creditAmount: year.creditAmount,
		creditValidUntil: year.creditValidUntil,
		choice: year.choice,
		/** The credit note that paid a cash bonus out, once it's issued (not a draft, nor void). */
		paidWith:
			year.creditNote && (year.creditNote.status === "sent" || year.creditNote.status === "paid")
				? { number: year.creditNote.number, settled: year.creditNote.status === "paid" }
				: null,
	}));
	return {
		partner: true as const,
		organization: currentTenant().name,
		year: now.year,
		rules: rules
			? {
					tiers: rules.tiers,
					categories: rules.categories,
					creditValidYears: rules.creditValidYears,
				}
			: null,
		figures,
		/** Where this year's credit would be valid until, if it's chosen. */
		validUntil: rules ? creditValidUntil(now.year, rules.creditValidYears) : null,
		closed,
		/** The latest closed year with a bonus still to choose. */
		awaiting:
			closed.find((year) => !year.choice && (year.cashAmount > 0 || year.creditAmount > 0)) ?? null,
		wallet: await walletOf(customer.id, now),
	};
});

/**
 * The partner's own choice for a closed year: cash, or credit in its wallet. Once and for good
 * (`chooseBonus()` refuses a second one); a year that isn't the customer's closed year is a 404.
 */
export const chooseClientBonus = forCustomers.form(
	v.object({ year: yearField, choice: v.picklist(bonusForms) }),
	async (input) => {
		const { customer } = await currentCustomer();
		await chooseBonus(customer.id, input.year, input.choice);
		void getClientPartner().refresh();
	},
);
