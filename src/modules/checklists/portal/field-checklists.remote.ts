/**
 * The checklists on the engineer portal's page of one of the engineer's orders: the checklist of
 * each of its units, filled in as they go (each answer saved as it's given, so a phone that drops
 * out loses nothing) and completed one by one. Only the engineer's own orders, while in progress.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { currentEngineer, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

import { pointResults, textLimits } from "../model.ts";
import { forEngineers } from "../remote-functions.ts";
import { answerPoint, completeChecklist, remarkChecklist, remarkPoint } from "../server/field.ts";
import { checklistRecords } from "../server/records.ts";
import { checklist } from "../server/schema.ts";

/**
 * The checklists of one of the engineer's orders (by its number), one per unit that has one, and
 * whether they can fill them in (while it's in progress); a 404 for anyone else's order.
 */
export const getFieldChecklists = forEngineers.query(v.string(), async (number) => {
	const engineer = await currentEngineer();
	const [found] = await db
		.select({ id: order.id, status: order.status })
		.from(order)
		.where(and(eq(order.number, number), inTenant(order), eq(order.engineerId, engineer.id)));
	if (!found) error(404, m.checklists_order_not_found({ number }));
	return {
		canChange: fieldActions(found.status).work,
		checklists: await checklistRecords(eq(checklist.orderId, found.id)),
	};
});

/** A record's id, as a command takes it: a number. */
const id = () => v.pipe(v.number(), v.integer(), v.minValue(1));

const remark = (max: number) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(max, (issue) => m.checklists_text_max({ max: issue.requirement })),
	);

/** Gives a point of one of the engineer's checklists a result (or none, to take it back). */
export const answer = forEngineers.command(
	v.object({ id: id(), result: v.nullable(v.picklist(pointResults)) }),
	async (input) => {
		const engineer = await currentEngineer();
		await answerPoint(engineer.id, input.id, input.result);
	},
);

/** Says what's wrong with a point (or what part it needs), as the remark a rejection needs. */
export const remarkOn = forEngineers.command(
	v.object({ id: id(), remark: remark(textLimits.remark) }),
	async (input) => {
		const engineer = await currentEngineer();
		await remarkPoint(engineer.id, input.id, input.remark);
	},
);

/** The general remark and advice for the customer on one of the engineer's checklists. */
export const remarkForCustomer = forEngineers.command(
	v.object({ id: id(), remarks: remark(textLimits.remarks) }),
	async (input) => {
		const engineer = await currentEngineer();
		await remarkChecklist(engineer.id, input.id, input.remarks);
	},
);

/** Completes one of the engineer's checklists once every point is answered; refreshes the card. */
export const complete = forEngineers.command(v.object({ id: id() }), async (input) => {
	const engineer = await currentEngineer();
	const number = await completeChecklist(engineer.id, input.id);
	void getFieldChecklists(number).refresh();
});
