/**
 * The live board (`/docks`): a site's docks with their live state, open session and recent
 * sessions, the rules' notices of the last day, and the sites that have docks to choose from.
 * `watchDocks` (`../docks.remote.ts`) tells an open board when to ask again: whenever the feed
 * applied events, the rules acted or a dock changed.
 */
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import * as v from "valibot";

import { recordId } from "#lib/schema.ts";
import { inTenant, sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { activity } from "#lib/server/db/schema.ts";

import { query } from "../remote-functions.ts";
import { sitesWithDocks, sessionColumns } from "../server/docks.ts";
import { dockPosition, dockSession, dockState } from "../server/schema.ts";

/** How many of each dock's sessions the board lists. */
const recentSessions = 5;

/**
 * The latest `recentSessions` sessions of each of the tenant's docks `ids`, newest first, in one
 * query: each dock's sessions numbered by when they checked in (`row_number()` per dock).
 */
function latestSessions(ids: number[]) {
	const numbered = db
		.select({
			id: dockSession.id,
			rank: sql<number>`row_number() over (
				partition by ${dockSession.dockId}
				order by ${dockSession.checkedInAt} desc, ${dockSession.id} desc
			)`.as("rank"),
		})
		.from(dockSession)
		.where(and(inTenant(dockSession), inList(dockSession.dockId, ids)))
		.as("numbered");
	return db
		.select({ dockId: dockSession.dockId, session: sessionColumns })
		.from(dockSession)
		.innerJoin(numbered, eq(numbered.id, dockSession.id))
		.where(and(inTenant(dockSession), lte(numbered.rank, recentSessions)))
		.orderBy(asc(dockSession.dockId), asc(numbered.rank));
}

/**
 * The board of the tenant's site `siteId`, or of the first site with docks. The docks come with
 * their facts (none for a dock that never reported), their open session and their latest sessions.
 */
export const getDockBoard = query(v.optional(recordId()), async (siteId) => {
	const sites = await sitesWithDocks();
	const site = sites.find((each) => each.id === siteId) ?? sites[0] ?? null;
	if (!site) return { sites, site: null, docks: [], notices: [] };

	const docks = await db
		.select({
			id: dockPosition.id,
			code: dockPosition.code,
			position: dockPosition.position,
			scpCode: dockPosition.scpCode,
			keyId: dockPosition.keyId,
			keyStorageUnit: dockPosition.keyStorageUnit,
			locked: dockState.locked,
			doorOpenSince: dockState.doorOpenSince,
			scpOnline: dockState.scpOnline,
			faultReason: dockState.faultReason,
			keyLocation: dockState.keyLocation,
			lastEventAt: dockState.lastEventAt,
		})
		.from(dockPosition)
		.leftJoin(
			dockState,
			and(sameTenant(dockState, dockPosition), eq(dockState.dockId, dockPosition.id)),
		)
		.where(and(inTenant(dockPosition), eq(dockPosition.siteId, site.id)))
		.orderBy(asc(dockPosition.code));
	const ids = docks.map((dock) => dock.id);

	const [open, recent, notices] = await Promise.all([
		ids.length
			? db
					.select({ dockId: dockSession.dockId, ...sessionColumns })
					.from(dockSession)
					.where(
						and(
							inTenant(dockSession),
							inList(dockSession.dockId, ids),
							isNull(dockSession.checkedOutAt),
						),
					)
			: [],
		ids.length ? latestSessions(ids) : [],
		ids.length
			? db
					.select({
						id: activity.id,
						action: activity.action,
						dock: activity.subjectLabel,
						note: activity.note,
						at: activity.createdAt,
					})
					.from(activity)
					.where(
						and(
							inTenant(activity),
							eq(activity.subjectType, "dock"),
							inList(
								activity.subjectId,
								ids.map((id) => String(id)),
							),
							inList(activity.action, ["door_alert", "door_escalated"]),
							gte(activity.createdAt, Temporal.Now.instant().subtract({ hours: 24 })),
						),
					)
					.orderBy(desc(activity.id))
					.limit(10)
			: [],
	]);

	return {
		sites,
		site,
		docks: docks.map((dock) => ({
			...dock,
			// A dock without events has no state yet (no row to join).
			reported: dock.locked !== null,
			session: open.find((session) => session.dockId === dock.id) ?? null,
			sessions: recent.filter((row) => row.dockId === dock.id).map((row) => row.session),
		})),
		notices,
	};
});
