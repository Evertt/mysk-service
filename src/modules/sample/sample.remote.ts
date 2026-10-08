import { query } from "$app/server";
import { asc, count } from "drizzle-orm";

import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { inTenant, requireModule, tenantJoin } from "#lib/server/session.ts";

import { sampleNote } from "./server/schema.ts";

/** The organization's notes, with the customer each is about. */
export const listSampleNotes = query(async () => {
	requireModule("sample");
	return db
		.select({ id: sampleNote.id, text: sampleNote.text, customer: customer.name })
		.from(sampleNote)
		.innerJoin(...tenantJoin(customer, sampleNote.customerId))
		.where(inTenant(sampleNote))
		.orderBy(asc(sampleNote.id));
});

/** How many notes the organization has. */
export const getSampleSummary = query(async () => {
	requireModule("sample");
	const [row] = await db.select({ count: count() }).from(sampleNote).where(inTenant(sampleNote));
	return { count: row.count };
});
