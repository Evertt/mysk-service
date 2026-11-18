/**
 * Orders a customer asks for in the customer portal, and the planner's decision on them. A
 * reported order (`requestOrder()`) is `awaiting_acceptance`: no open work yet, so off the planning
 * board and its backlog, holding no stock, and with no response time running out (a contract's
 * response time counts from the report, as the customer made it, see the contracts module). A
 * planner accepts it (`transitionOrder()`'s `accept`: it's then a quote, or scheduled when they
 * plan it in the same step) or rejects it with a reason (its `reject`: it's cancelled, and the
 * customer reads the reason in their portal). Orders made in the office never await acceptance.
 */
import { and, count, eq } from "drizzle-orm";

import type { ReportFault } from "#lib/models.ts";
import { getLocale } from "#lib/paraglide/runtime.js";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { order, orderRequest } from "#lib/server/db/schema.ts";

import { createOrders, type OrderDraft } from "./creation.ts";
import { addOrderPhotos, discardOrderPhotos, storeOrderPhotos } from "./photos.ts";

/**
 * Creates an order a customer's contact reports in the portal, in `tx`, through `createOrders()`
 * (checked, numbered and logged as created, by them), awaiting acceptance, with who reported it and
 * the kind of fault they chose, if any.
 */
export async function requestOrder(
	tx: Transaction,
	{
		fault = null,
		...draft
	}: Omit<OrderDraft, "status" | "engineerId" | "scheduledFor" | "completedAt" | "laborHours"> & {
		fault?: ReportFault | null;
	},
) {
	const { organizationId, user } = currentTenant();
	const [created] = await createOrders(tx, [{ ...draft, status: "awaiting_acceptance" }]);
	await tx.insert(orderRequest).values({
		orderId: created.id,
		organizationId,
		userId: user.id,
		reporterName: user.name,
		fault,
		// The mails about its progress are in this language (`./reporter-mail.ts`).
		reporterLocale: getLocale(),
	});
	return created;
}

/** A breakdown as a customer's contact reports it: its order's fields, and their photos. */
type Report = Parameters<typeof requestOrder>[1] & { photos?: readonly File[] };

/**
 * Makes the order of a breakdown a customer's contact reports in the portal (`requestOrder()`),
 * with their photos: the photos are put in the store first (`storeOrderPhotos()`: checked, else a
 * `Refused` on `photos` and no order), outside the transaction, which then makes the order and
 * records them; should it fail, the stored photos are taken away again.
 */
export async function reportOrder({ photos: files = [], ...report }: Report) {
	const photos = await storeOrderPhotos(files);
	try {
		return await db.transaction(async (tx) => {
			const created = await requestOrder(tx, report);
			await addOrderPhotos(tx, created, photos);
			return created;
		});
	} catch (thrown) {
		await discardOrderPhotos(photos);
		throw thrown;
	}
}

/**
 * How many of the tenant `organizationId`'s orders await acceptance, for the badge on the office
 * sidebar's Orders. The tenant is the one a live query's gate admitted, read once
 * (`currentTenant()`), as `inTenant()` would: its later answers run outside the request.
 */
export async function awaitingAcceptance(organizationId: string) {
	const [row] = await db
		.select({ count: count() })
		.from(order)
		.where(and(eq(order.organizationId, organizationId), eq(order.status, "awaiting_acceptance")));
	return row?.count ?? 0;
}
