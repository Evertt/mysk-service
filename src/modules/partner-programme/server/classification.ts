/**
 * How an order's revenue counts for the programme (`partner_order_classification`), as the order
 * form's part sets it: saved with the order in its transaction (`orders.saving`), and logged
 * against it. An order left at the defaults has no row.
 */
import { and, eq } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import type { OrderSaving } from "#lib/orders/extensions.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

import type { Eligibility, RevenueCategory } from "../model.ts";
import { orderClassification } from "./schema.ts";

/** An order's classification; `null`s are the defaults. */
export interface Classification {
	category: RevenueCategory | null;
	eligibility: Eligibility | null;
	share: number | null;
}

const none: Classification = { category: null, eligibility: null, share: null };

/** The tenant's order's classification, the defaults if it has none. */
export async function classificationOf(
	orderId: number,
	tx: Transaction | typeof db = db,
): Promise<Classification> {
	const [row] = await tx
		.select({
			category: orderClassification.category,
			eligibility: orderClassification.eligibility,
			share: orderClassification.share,
		})
		.from(orderClassification)
		.where(and(inTenant(orderClassification), eq(orderClassification.orderId, orderId)));
	return row ?? none;
}

/**
 * The order form's part, saved with the order (`orders.saving`): stores what isn't the default,
 * removes the row of an order back at the defaults, and logs a change against the order. Nothing
 * when the form had no part of ours, or for other changes (an order's deletion takes its row).
 */
export async function saveClassification({ tx, order, status, form }: OrderSaving) {
	const part = form?.partnerProgramme;
	if (!part || !status) return undefined;
	const after: Classification = {
		category: part.category || null,
		eligibility: part.eligibility || null,
		share: part.eligibility === "partial" ? (part.share ?? null) : null,
	};
	const before = await classificationOf(order.id, tx);
	const scope = and(inTenant(orderClassification), eq(orderClassification.orderId, order.id));
	if (!after.category && !after.eligibility) {
		await tx.delete(orderClassification).where(scope);
	} else {
		await tx
			.insert(orderClassification)
			.values({ organizationId: currentTenant().organizationId, orderId: order.id, ...after })
			.onConflictDoUpdate({
				target: [orderClassification.organizationId, orderClassification.orderId],
				set: after,
			});
	}
	await recordActivity(tx, {
		action: "updated",
		subject: { type: "partner_classification", id: order.id, label: order.number },
		parent: orderSubject(order),
		before,
		after,
	});
	return undefined;
}
