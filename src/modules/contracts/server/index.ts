/**
 * The service contracts module's hooks into core (see `#lib/server/modules/hooks.ts`): contracts make
 * the work they include free of charge in an order's price, flag orders whose response is at risk,
 * refresh the coverage an order's page shows once it's saved, and offer their monthly fees for
 * billing. The rules themselves are in `../coverage.ts` and `../billing.ts`.
 */
import { and, eq, gte, lte } from "drizzle-orm";

import { formatDate, formatDateTime } from "#lib/i18n/format.ts";
import type { OrderTag } from "#lib/modules/manifests.ts";
import { m } from "#lib/paraglide/messages.js";
import { inTenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { defineServerModule, type OrderFacts } from "#lib/server/modules/hooks.ts";

import { contractMonths, monthlyFee } from "../billing.ts";
import { getOrderCoverage } from "../coverage.remote.ts";
import { coveredAmount, coveredBy, includedLabel, responseDeadline } from "../coverage.ts";
import { contractLabels } from "../labels.ts";
import { type Coverage, coverageOf } from "./contracts.ts";
import { contract } from "./schema.ts";

/** The badge for a covered order whose response is at risk or overdue. */
function responseTag(order: OrderFacts, coverage: Coverage, now: Date): OrderTag | undefined {
	const deadline = responseDeadline(order, coverage.responseHours, now);
	if (!deadline) return undefined;
	const detail = m.contracts_respond_by_detail({
		due: formatDateTime(deadline.due),
		number: coverage.number,
	});
	if (deadline.state === "overdue")
		return { label: m.contracts_sla_overdue(), tone: "danger", detail };
	if (deadline.state === "at_risk")
		return { label: m.contracts_sla_at_risk(), tone: "warning", detail };
	return undefined;
}

export default defineServerModule("contracts", {
	orders: {
		async adjustPrices(orders) {
			const coverage = await coverageOf(orders);
			return new Map(
				orders.flatMap((order) => {
					const covering = coverage.get(order.id);
					const amount = covering ? coveredAmount(covering.level, order) : 0;
					if (!covering || !amount) return [];
					const adjustment = {
						label: coveredBy(covering),
						detail: m.contracts_included_detail({ included: includedLabel(covering.level) }),
						amount: -amount,
					};
					return [[order.id, [adjustment]]];
				}),
			);
		},

		async tag(orders, now) {
			const coverage = await coverageOf(orders);
			return new Map(
				orders.flatMap((order) => {
					const covering = coverage.get(order.id);
					const tag = covering && responseTag(order, covering, now);
					return tag ? [[order.id, [tag]]] : [];
				}),
			);
		},

		committed({ number }) {
			void getOrderCoverage(number).refresh();
		},
	},

	billing: {
		// A month's fee for each month of the customer's contracts.
		async billableItems(customerId, { from, until }) {
			const found = await db
				.select({
					id: contract.id,
					number: contract.number,
					level: contract.level,
					startsOn: contract.startsOn,
					endsOn: contract.endsOn,
					monthlyFee: contract.monthlyFee,
				})
				.from(contract)
				.where(
					and(
						eq(contract.customerId, customerId),
						inTenant(contract),
						lte(contract.startsOn, until),
						gte(contract.endsOn, from),
					),
				);
			return found.flatMap((term) =>
				contractMonths(term, from, until).map((month) =>
					// Stored on the invoice line, in the language of whoever bills it.
					monthlyFee(term, month, {
						description: m.contracts_fee_description({
							number: term.number,
							level: contractLabels.label("contractLevel", term.level),
						}),
						detail: m.contracts_fee_detail({
							from: formatDate(month.startsOn),
							until: formatDate(month.endsOn),
						}),
					}),
				),
			);
		},
	},
});
