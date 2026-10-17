/**
 * The live board (`/docks`): a site's docks with their live state, open session and recent
 * sessions, the rules' notices of the last day, and the sites that have docks to choose from.
 * `watchDocks` tells an open board when to ask again: whenever the feed applied events, the rules
 * acted or a dock changed.
 */
import { getRequestEvent } from "$app/server";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { changedAt, watchChanges } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { activity } from "#lib/server/db/schema.ts";

import { query } from "../remote-functions.ts";
import { sitesWithDocks, sessionColumns } from "../server/docks.ts";
import { dockPosition, dockSession, dockState } from "../server/schema.ts";

/** How many of each dock's sessions the board lists. */
const recentSessions = 5;

/**
 * The board of the tenant's site `siteId`, or of the first site with docks. The docks come with
 * their facts (none for a dock that never reported), their open session and their latest sessions.
 */
export const getDockBoard = query(v.optional(v.pipe(v.number(), v.integer())), async (siteId) => {
	const sites = await sitesWithDocks();
	const site = sites.find((each) => each.id === siteId) ?? sites[0] ?? null;
	const canManage = isManager(currentTenant().roles);
	if (!site) return { sites, site: null, docks: [], notices: [], canManage };

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
			and(
				eq(dockState.organizationId, dockPosition.organizationId),
				eq(dockState.dockId, dockPosition.id),
			),
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
		Promise.all(
			ids.map((id) =>
				db
					.select(sessionColumns)
					.from(dockSession)
					.where(and(inTenant(dockSession), eq(dockSession.dockId, id)))
					.orderBy(desc(dockSession.checkedInAt))
					.limit(recentSessions),
			),
		),
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
		canManage,
		docks: docks.map((dock, i) => ({
			...dock,
			// A dock without events has no state yet (no row to join).
			reported: dock.locked !== null,
			session: open.find((session) => session.dockId === dock.id) ?? null,
			sessions: recent[i],
		})),
		notices,
	};
});

/** The records the board shows: a change to any of them outdates it. */
const boardSubjects = ["dock", "customer"] as const;

/**
 * When the board's records last changed (epoch ms, 0 if not since the server started), sent again
 * on each change: events applied, the rules' notices, docks added or edited.
 */
export const watchDocks = query.live(async function* () {
	const { organizationId } = currentTenant();
	const changes = watchChanges(organizationId, boardSubjects);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	try {
		yield changedAt(organizationId, boardSubjects);
		for await (const _ of changes) yield changedAt(organizationId, boardSubjects);
	} finally {
		changes.stop();
	}
});
