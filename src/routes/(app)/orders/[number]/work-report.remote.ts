import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { db } from "#lib/server/db/index.js";
import { order, orderNote, orderSignoff, user } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";

/** What was recorded on an order in the field: notes and the customer's sign-off. */
export const getWorkReport = query(v.string(), async (number) => {
	requireMember();
	const found = await db.query.order.findFirst({
		columns: { id: true },
		where: and(eq(order.number, number), inTenant(order)),
	});
	if (!found) error(404, `Order ${number} not found`);

	const [notes, signoff] = await Promise.all([
		db
			.select({
				id: orderNote.id,
				text: orderNote.text,
				createdAt: orderNote.createdAt,
				author: user.name,
			})
			.from(orderNote)
			.leftJoin(user, eq(orderNote.userId, user.id))
			.where(and(eq(orderNote.orderId, found.id), inTenant(orderNote)))
			.orderBy(asc(orderNote.createdAt), asc(orderNote.id)),
		db
			.select({
				signerName: orderSignoff.signerName,
				signature: orderSignoff.signature,
				signedAt: orderSignoff.signedAt,
				collectedBy: user.name,
			})
			.from(orderSignoff)
			.leftJoin(user, eq(orderSignoff.userId, user.id))
			.where(and(eq(orderSignoff.orderId, found.id), inTenant(orderSignoff))),
	]);
	return { notes, signoff: signoff[0] ?? null };
});
