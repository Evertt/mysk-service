/**
 * The engineer portal's data: only the signed-in engineer's own orders. Every function is gated by
 * `forEngineers`, and every order lookup is scoped to the tenant and to their engineer id, so
 * another engineer's order (or another tenant's) is a 404, also by a tampered id.
 */
import { getRequestEvent } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import * as v from "valibot";

import { formatNumber, label } from "#lib/i18n";
import { OrderStockShortage, moveOrderStock } from "#lib/materials/server";
import { doneOrderStatuses, type OrderStatus } from "#lib/models.ts";
import { checkLines, saveOrderLines } from "#lib/orders/server";
import { id, laborHours, orderLines, text } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity";
import {
	auth,
	currentEngineer,
	currentTenant,
	idInTenant,
	inTenant,
	tenantJoin,
} from "#lib/server/auth";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, material, order, orderNote, orderSignoff, user } from "#lib/server/db/schema.ts";
import { forAnyone, forEngineers } from "#lib/server/remote-functions.ts";

import { fieldActions, signature } from "./work.ts";

/** Who is signed in, for the portal's header. */
export const getMe = forEngineers.query(async () => {
	const engineer = await currentEngineer();
	return { name: engineer.name, organization: currentTenant().name };
});

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
	const engineer = await currentEngineer();
	const mine = and(inTenant(order), eq(order.engineerId, engineer.id));
	const [open, recent] = await Promise.all([
		db
			.select(listColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(and(mine, inArray(order.status, ["scheduled", "in_progress"])))
			.orderBy(asc(order.scheduledFor)),
		db
			.select(listColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(and(mine, inArray(order.status, doneOrderStatuses), isNotNull(order.completedAt)))
			.orderBy(desc(order.completedAt))
			.limit(10),
	]);
	return { open, recent };
});

/** One of the engineer's orders, with what they need on site; a 404 for anyone else's. */
export const getMyOrder = forEngineers.query(v.string(), async (number) => {
	const engineer = await currentEngineer();
	const found = await db.query.order.findFirst({
		where: and(eq(order.number, number), inTenant(order), eq(order.engineerId, engineer.id)),
		with: {
			customer: {
				columns: { name: true, contactName: true, phone: true, email: true, city: true },
			},
			equipment: {
				columns: { model: true, manufacturer: true, serialNumber: true, category: true },
			},
			lines: {
				columns: { id: true, materialId: true, quantity: true },
				with: { material: { columns: { sku: true, name: true, unit: true } } },
				orderBy: (line, { asc }) => asc(line.id),
			},
		},
	});
	if (!found) error(404, m.portal_not_found({ number }));

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
		db.query.orderSignoff.findFirst({
			columns: { signerName: true, signature: true, signedAt: true },
			where: and(eq(orderSignoff.orderId, found.id), inTenant(orderSignoff)),
		}),
	]);
	return { order: found, notes, signoff: signoff ?? null };
});

/** The materials an engineer can use on a job, by name. */
export const getUsableMaterials = forEngineers.query(async () => {
	return db
		.select({ id: material.id, sku: material.sku, name: material.name, unit: material.unit })
		.from(material)
		.where(inTenant(material))
		.orderBy(asc(material.name));
});

/**
 * One of the engineer's (`engineerId`) orders, with its lines, in a transaction, if they may do
 * `action` with it in its current status; otherwise a 404 (not theirs) or what's in the way.
 */
async function findMyOrder(
	tx: Transaction,
	engineerId: number,
	orderId: number,
	action: keyof ReturnType<typeof fieldActions>,
) {
	const found = await tx.query.order.findFirst({
		columns: { id: true, number: true, status: true, laborHours: true },
		where: and(idInTenant(order, orderId), eq(order.engineerId, engineerId)),
		with: { lines: true },
	});
	if (!found) error(404, m.portal_not_found_plain());
	if (!fieldActions(found.status)[action]) {
		invalid(
			found.status === "scheduled"
				? m.portal_start_first()
				: m.portal_cant_change({ status: label("orderStatus", found.status).toLowerCase() }),
		);
	}
	return found;
}

type MyOrder = Awaited<ReturnType<typeof findMyOrder>>;

/** How an order shows in the activity log. */
const subjectOf = (found: MyOrder) => ({ type: "order", id: found.id, label: found.number });

/**
 * Changes the status of an order (in the transaction), with the stock that follows from it, and
 * logs it as `action`.
 */
async function setStatus(
	tx: Transaction,
	found: MyOrder,
	status: OrderStatus,
	action: "work_started" | "completed",
	{ completedAt, note }: { completedAt?: Date; note?: string } = {},
) {
	await tx.update(order).set({ status, completedAt }).where(idInTenant(order, found.id));
	await moveOrderStock(tx, found, found, { status, lines: found.lines });
	await recordActivity(tx, {
		action,
		subject: subjectOf(found),
		before: found,
		after: { status },
		note,
	});
}

/** Refreshes what the portal shows of an order after a change. */
function refreshMyOrder(number: string) {
	void getMyOrder(number).refresh();
	void getMyWork().refresh();
}

/** Starts a scheduled job: it's then in progress. */
export const startWork = forEngineers.form(v.object({ id: id() }), async (input) => {
	const engineer = await currentEngineer();
	const number = await db.transaction(async (tx) => {
		const found = await findMyOrder(tx, engineer.id, input.id, "start");
		await setStatus(tx, found, "in_progress", "work_started");
		return found.number;
	});
	refreshMyOrder(number);
});

/** Sets the hours of labour on a job under way. */
export const logHours = forEngineers.form(
	v.object({ id: id(), laborHours: laborHours() }),
	async (input, issue) => {
		const engineer = await currentEngineer();
		if (input.laborHours > 24 * 14) invalid(issue.laborHours(m.portal_hours_too_many()));
		const number = await db.transaction(async (tx) => {
			const found = await findMyOrder(tx, engineer.id, input.id, "work");
			const after = { laborHours: input.laborHours };
			await tx.update(order).set(after).where(idInTenant(order, found.id));
			await recordActivity(tx, {
				action: "updated",
				subject: subjectOf(found),
				before: found,
				after,
			});
			return found.number;
		});
		refreshMyOrder(number);
	},
);

/**
 * Replaces the materials used on a job under way, through the same code as the office's order
 * form: they take or return stock, and more than there is in stock is refused on the line.
 */
export const saveMaterials = forEngineers.form(
	v.object({ id: id(), lines: orderLines() }),
	async (input, issue) => {
		const engineer = await currentEngineer();
		const problems = await checkLines(input.lines);
		if (problems.length) {
			invalid(...problems.map((p) => issue.lines[p.line][p.field](p.message)));
		}
		const number = await db
			.transaction(async (tx) => {
				const found = await findMyOrder(tx, engineer.id, input.id, "work");
				await saveOrderLines(tx, found, found, { status: found.status, lines: input.lines });
				return found.number;
			})
			.catch((error) => {
				if (!(error instanceof OrderStockShortage)) throw error;
				const line = input.lines.findLastIndex((line) => line.materialId === error.materialId);
				invalid(issue.lines[line].quantity(error.message));
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
		const engineer = await currentEngineer();
		if (input.text.length > MAX_NOTE_LENGTH) {
			invalid(issue.text(m.portal_note_too_long({ max: formatNumber(MAX_NOTE_LENGTH) })));
		}
		const number = await db.transaction(async (tx) => {
			const found = await findMyOrder(tx, engineer.id, input.id, "note");
			await tx.insert(orderNote).values({
				organizationId,
				orderId: found.id,
				userId: author.id,
				text: input.text,
			});
			await recordActivity(tx, {
				action: "note_added",
				subject: subjectOf(found),
				note: input.text,
			});
			return found.number;
		});
		refreshMyOrder(number);
	},
);

/** Completes a job under way with the customer's sign-off: their name and signature. */
export const completeWork = forEngineers.form(
	v.object({
		id: id(),
		signerName: text(m.portal_signer_required),
		signature: signature(),
	}),
	async (input) => {
		const { organizationId, user: signedInUser } = currentTenant();
		const engineer = await currentEngineer();
		const number = await db.transaction(async (tx) => {
			const found = await findMyOrder(tx, engineer.id, input.id, "work");
			const now = new Date();
			await setStatus(tx, found, "completed", "completed", {
				completedAt: now,
				// Stored, in the language of whoever completes it.
				note: m.portal_signed_off_note({ name: input.signerName }),
			});
			const signoff = {
				signerName: input.signerName,
				signature: input.signature,
				userId: signedInUser.id,
				signedAt: now,
			};
			await tx
				.insert(orderSignoff)
				.values({ orderId: found.id, organizationId, ...signoff })
				.onConflictDoUpdate({ target: orderSignoff.orderId, set: signoff });
			return found.number;
		});
		refreshMyOrder(number);
	},
);

/** Signs out, back to the login page. */
export const signOut = forAnyone.form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
