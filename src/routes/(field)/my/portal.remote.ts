/**
 * The engineer portal's data: only the signed-in engineer's own orders. Every function is gated by
 * `forEngineers`, and every order lookup is scoped to the tenant and to their engineer id, so
 * another engineer's order (or another tenant's) is a 404, also by a tampered id.
 */
import { invalid } from "@sveltejs/kit";
import { and, asc, desc, isNotNull } from "drizzle-orm";
import * as v from "valibot";

import { orderSubject } from "#lib/activity/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { doneOrderStatuses, engineerWorkStatuses } from "#lib/models.ts";
import {
	engineerWork,
	findEngineerOrder,
	orderCommitted,
	readWorkRecord,
	transitionOrder,
} from "#lib/orders/server/index.ts";
import { id, laborHours, text } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	engineerOrderNotFound,
	engineerOrders,
	idInTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, order, orderNote } from "#lib/server/db/schema.ts";
import { feedFor, live, liveFeed } from "#lib/server/live.ts";
import { forEngineers } from "#lib/server/remote-functions.ts";

import { signature } from "./work.ts";

/** The columns of an order in the lists. */
const listColumns = {
	id: order.id,
	number: order.number,
	type: order.type,
	status: order.status,
	priority: order.priority,
	description: order.description,
	scheduledFor: order.scheduledFor,
	completedAt: order.completedAt,
	customer: { name: customer.name, city: customer.city },
};

/** The engineer's open work (scheduled or under way), and what they completed recently. */
export const getMyWork = forEngineers.query(async () => {
	const mine = await engineerOrders();
	const [open, recent] = await Promise.all([
		db
			.select(listColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(and(mine, inList(order.status, engineerWorkStatuses)))
			.orderBy(asc(order.scheduledFor)),
		db
			.select(listColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(and(mine, inList(order.status, doneOrderStatuses), isNotNull(order.completedAt)))
			.orderBy(desc(order.completedAt))
			.limit(10),
	]);
	return { open, recent };
});

/**
 * One of the engineer's orders, with what they need on site: its work record (its units in the
 * order they're worked on, the sites they're at, the notes and the sign-off, see
 * `readWorkRecord()`) and whom to ask at the customer. A 404 for anyone else's.
 */
export const getMyOrder = forEngineers.query(v.string(), async (number) => {
	const scope = await engineerWork({ number });
	const [found, record] = await Promise.all([
		db.query.order.findFirst({
			where: scope.where,
			with: {
				customer: {
					columns: { name: true, contactName: true, phone: true, email: true, city: true },
				},
			},
		}),
		readWorkRecord(scope),
	]);
	if (!found || !record) engineerOrderNotFound({ number });
	const { units, sites, notes, signoff } = record;
	return { order: { ...found, units }, sites, notes, signoff };
});

/** The records the portal shows: a change to any of them may outdate it. */
const portalTypes = ["order", "customer", "site", "equipment"] as const;

/**
 * When the records the portal shows last changed (epoch ms, 0 if not since the server started),
 * sent again on each change, so an open portal refreshes when the office assigns, reschedules,
 * changes or cancels an order. Any change of those types in the tenant, not only the engineer's:
 * it says only that something changed, and the queries it has the portal refresh are gated again.
 */
export const watchMyWork = forEngineers.query.live(() => live(portalTypes));

/**
 * The changes to the engineer's own orders and to the tenant's units, for the one live query a
 * portal tab shares (`provideChangeFeed()` in its layout), which tells the cards that follow one
 * of them (`refreshOnRecordChange()`). What it tells is what the engineer may read (`feedFor()`:
 * their own orders and the units), without who made it; see `liveFeed()` for its answers.
 */
export const watchFieldChanges = forEngineers.query.live(() =>
	liveFeed(["order", "equipment"], feedFor()),
);

/**
 * Refreshes what the portal shows of an order after a change, the modules' cards on it too (they
 * refresh their own queries on `orders.committed`).
 */
function refreshMyOrder(number: string) {
	void getMyOrder(number).refresh();
	void getMyWork().refresh();
	orderCommitted({ number });
}

/** Starts a scheduled job: it's then in progress. */
export const startWork = forEngineers.form(v.object({ id: id() }), async (input) => {
	const { number } = await db.transaction((tx) =>
		transitionOrder(tx, { verb: "start", id: input.id }),
	);
	refreshMyOrder(number);
});

/** Sets the hours of labour on a job under way. */
export const logHours = forEngineers.form(
	v.object({ id: id(), laborHours: laborHours() }),
	async (input, issue) => {
		if (input.laborHours > 24 * 14) invalid(issue.laborHours(m.portal_hours_too_many()));
		const number = await db.transaction(async (tx) => {
			const found = await findEngineerOrder(tx, { id: input.id }, "work");
			const after = { laborHours: input.laborHours };
			await tx.update(order).set(after).where(idInTenant(order, found.id));
			await recordActivity(tx, {
				action: "updated",
				subject: orderSubject(found),
				before: found,
				after,
			});
			return found.number;
		});
		refreshMyOrder(number);
	},
);

/** The longest note an engineer can write. */
const MAX_NOTE_LENGTH = 2000;

/** Adds a note to a job. */
export const addNote = forEngineers.form(
	v.object({ id: id(), text: text(m.portal_note_required) }),
	async (input, issue) => {
		const { organizationId, user: author } = currentTenant();
		if (input.text.length > MAX_NOTE_LENGTH) {
			invalid(issue.text(m.portal_note_too_long({ max: formatNumber(MAX_NOTE_LENGTH) })));
		}
		const number = await db.transaction(async (tx) => {
			const found = await findEngineerOrder(tx, { id: input.id }, "note");
			await tx.insert(orderNote).values({
				organizationId,
				orderId: found.id,
				userId: author.id,
				text: input.text,
			});
			await recordActivity(tx, {
				action: "note_added",
				subject: orderSubject(found),
				note: input.text,
			});
			return found.number;
		});
		refreshMyOrder(number);
	},
);

/**
 * Completes a job under way with the work order's sign-off: the customer's name and signature, and
 * the engineer's own signature, in their name as the tenant knows them (not one the form could
 * send). A module may refuse it, e.g. while a checklist isn't completed. Logged with who signed
 * for the customer, once the sign-off is in (`transitionOrder()`'s `complete`).
 */
export const completeWork = forEngineers.form(
	v.object({
		id: id(),
		signerName: text(m.portal_signer_required),
		signature: signature(),
		engineerSignature: signature(m.portal_engineer_signature_required),
	}),
	async ({ id, ...signoff }) => {
		const { number } = await db.transaction((tx) =>
			transitionOrder(tx, { verb: "complete", id, signoff }),
		);
		refreshMyOrder(number);
	},
);
