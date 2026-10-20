/**
 * The checklists on the engineer portal's page of one of the engineer's orders: the checklist of
 * each of its units, filled in as they go (each answer saved as it's given, so a phone that drops
 * out loses nothing) and completed one by one. Only the engineer's own orders, while in progress.
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { findEngineerOrder } from "#lib/orders/server/index.ts";
import { db } from "#lib/server/db/index.ts";

import {
	answerSchema,
	checklistIdSchema,
	pointRemarkSchema,
	remarksSchema,
} from "../form/fill-schema.ts";
import { forEngineers } from "../remote-functions.ts";
import { answerPoint, completeChecklist, remarkChecklist, remarkPoint } from "../server/field.ts";
import { checklistRecords } from "../server/records.ts";
import { checklist } from "../server/schema.ts";

/**
 * The checklists of one of the engineer's orders (by its number), one per unit that has one, and
 * whether they can fill them in (while it's in progress); a 404 for anyone else's order.
 */
export const getFieldChecklists = forEngineers.query(v.string(), async (number) => {
	const found = await findEngineerOrder(db, { number });
	return {
		canChange: fieldActions(found.status).work,
		checklists: await checklistRecords(eq(checklist.orderId, found.id)),
	};
});

/** Gives a point of one of the engineer's checklists a result (or none, to take it back). */
export const answer = forEngineers.command(answerSchema, async (input) => {
	await answerPoint("engineer", input.id, input.result);
});

/** Says what's wrong with a point (or what part it needs), as the remark a rejection needs. */
export const remarkOn = forEngineers.command(pointRemarkSchema, async (input) => {
	await remarkPoint("engineer", input.id, input.remark);
});

/** The general remark and advice for the customer on one of the engineer's checklists. */
export const remarkForCustomer = forEngineers.command(remarksSchema, async (input) => {
	await remarkChecklist("engineer", input.id, input.remarks);
});

/** Completes one of the engineer's checklists once every point is answered (logged on its order). */
export const complete = forEngineers.command(checklistIdSchema, async (input) => {
	await completeChecklist("engineer", input.id);
});
