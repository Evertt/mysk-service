/**
 * A unit's timeline in each shell: a page of it (the first with today's figures), as the viewer may
 * see it (`#lib/equipment/server/timeline.ts`). One query per shell, each with its gate, so a
 * member who is also an engineer reads the office's in the office and theirs in the engineer portal.
 */
import * as v from "valibot";

import { forCustomers, forEngineers, forMembers } from "#lib/server/remote-functions.ts";

import { unitTimeline } from "../server/timeline.ts";

/** The unit by its serial number, and the page's start: after an entry (its moment and id). */
const timelinePage = v.object({
	serial: v.string(),
	before: v.optional(
		v.object({
			at: v.pipe(
				v.string(),
				v.check((value) => {
					try {
						Temporal.Instant.from(value);
						return true;
					} catch {
						return false;
					}
				}),
			),
			id: v.string(),
		}),
	),
});

type Page = v.InferOutput<typeof timelinePage>;

const read = ({ serial, before }: Page) =>
	unitTimeline(serial, before ? { at: Temporal.Instant.from(before.at), id: before.id } : null);

/** One of the tenant's units' timeline, for the office. */
export const getUnitTimeline = forMembers.query(timelinePage, read);

/** A unit's timeline in the engineer portal, of what the engineer may read. */
export const getFieldUnitTimeline = forEngineers.query(timelinePage, read);

/** One of the customer's units' timeline in the customer portal, at the contact's sites. */
export const getPortalUnitTimeline = forCustomers.query(timelinePage, read);
