/**
 * Who may read and change the partner programme's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The office reads them all; the rules, accepting partners, closing years and
 * the wallet are a manager's to change (a classification any member's). A partner's contact reads
 * their customer's own partnership, closed years and wallet, and this year's rules, and makes their
 * own bonus choice for a closed year that has none yet. An order's classification is the office's.
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { type AccessRule, rows } from "#lib/server/access/rules.ts";
import { inTenant, ofCustomer } from "#lib/server/auth/index.ts";

import type { partnerSubjects } from "../activity.ts";
import {
	bonusYear,
	orderClassification,
	partnerAccount,
	programmeYear,
	walletEntry,
} from "./schema.ts";

export const partnerAccess = {
	// The partner's subject is its customer, by the customer's id.
	partner: rows(
		partnerAccount,
		partnerAccount.customerId,
		{ office: true, customer: ({ access }) => ofCustomer(access, partnerAccount) },
		{ change: "manager" },
	),
	// The portal shows the rules of this year, to a partner.
	partner_programme_year: rows(
		programmeYear,
		programmeYear.id,
		{
			office: true,
			customer: ({ access }) =>
				and(
					inTenant(programmeYear),
					eq(programmeYear.year, currentDay().year),
					sql`exists (select 1 from ${partnerAccount} where ${ofCustomer(access, partnerAccount)})`,
				),
		},
		{ change: "manager" },
	),
	// An order's classification is logged by the order's id.
	partner_classification: rows(orderClassification, orderClassification.orderId, { office: true }),
	partner_bonus_year: rows(
		bonusYear,
		bonusYear.id,
		{ office: true, customer: ({ access }) => ofCustomer(access, bonusYear) },
		{
			change: {
				office: "manager",
				customer: ({ access }) => and(ofCustomer(access, bonusYear), isNull(bonusYear.choice)),
			},
		},
	),
	partner_wallet_entry: rows(
		walletEntry,
		walletEntry.id,
		{ office: true, customer: ({ access }) => ofCustomer(access, walletEntry) },
		{ change: "manager" },
	),
} satisfies Record<keyof typeof partnerSubjects, AccessRule>;
