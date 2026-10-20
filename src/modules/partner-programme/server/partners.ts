/**
 * The partners: the customers the tenant accepted into its programme (`partner_account`), and
 * their figures for a year, computed from their paid invoices under the year's rules.
 */
import { and, asc, eq, lte } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { customerByCode } from "#lib/customers/server/index.ts";
import { currentDay } from "#lib/dates.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, currentUser, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, user } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

import { type ProgrammeRules, yearFigures, type YearFigures } from "../model.ts";
import { revenueLines } from "./revenue.ts";
import { partnerAccount } from "./schema.ts";

/** Today, the user's (or, in a job, the run's zone's). */

/** The tenant's customer with `code`, with its partner account if it's a partner; a 404 if none. */
export async function partnerByCode(code: string) {
	const row = await customerByCode(code, (where) =>
		db
			.select({
				id: customer.id,
				code: customer.code,
				name: customer.name,
				acceptedOn: partnerAccount.acceptedOn,
				acceptedBy: user.name,
			})
			.from(customer)
			.leftJoin(
				partnerAccount,
				and(eq(partnerAccount.customerId, customer.id), inTenant(partnerAccount)),
			)
			.leftJoin(user, eq(user.id, partnerAccount.acceptedBy))
			.where(where),
	);
	const { acceptedOn, acceptedBy, ...rest } = row;
	return { ...rest, partner: acceptedOn ? { acceptedOn, acceptedBy } : null };
}

/** The partner's subject in the activity log: its customer, by code. */
const partnerSubject = (partner: { id: number; code: string }): Subject => ({
	type: "partner",
	id: partner.id,
	label: partner.code,
});

/** Accepts the tenant's customer into the programme, today, by the signed-in user; logged. */
export async function acceptPartner(code: string) {
	const found = await partnerByCode(code);
	if (found.partner) throw new Refused(m.partners_already_partner());
	const acceptedOn = currentDay();
	await db.transaction(async (tx) => {
		await tx.insert(partnerAccount).values({
			organizationId: currentTenant().organizationId,
			customerId: found.id,
			acceptedOn,
			acceptedBy: currentUser().id,
		});
		await recordActivity(tx, {
			action: "accepted",
			subject: partnerSubject(found),
			parent: customerSubject(found),
			before: {},
			after: { acceptedOn },
		});
	});
}

/** The tenant's partners accepted by the end of `year` (the ones it closes for), by customer. */
export async function partnersOf(year: number, tx: Transaction | typeof db = db) {
	return tx
		.select({
			id: customer.id,
			code: customer.code,
			name: customer.name,
			acceptedOn: partnerAccount.acceptedOn,
		})
		.from(partnerAccount)
		.innerJoin(...tenantJoin(customer, partnerAccount.customerId))
		.where(
			and(
				inTenant(partnerAccount),
				lte(partnerAccount.acceptedOn, new Temporal.PlainDate(year, 12, 31)),
			),
		)
		.orderBy(asc(customer.name));
}

/** The customers' figures for the rules' year, by customer id. */
export async function figuresOf(
	rules: ProgrammeRules,
	customerIds: readonly number[],
): Promise<Map<number, YearFigures>> {
	const lines = await revenueLines(rules.year, customerIds);
	return new Map([...lines].map(([id, each]) => [id, yearFigures(rules, each)]));
}
