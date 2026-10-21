/**
 * A live query's answers (`query.live`): `live()` watches the current tenant's changes to the
 * records a page shows and answers again after each, until the client goes away. It owns what every
 * live query needs in the same order: watching before the first answer (so a change in between
 * isn't missed), stopping when the request ends (also for a generator that was never resumed, a
 * live query during server-side rendering), and answering later changes inside the request it was
 * made in (on Cloudflare its generator resumes outside the Durable Object's request; see
 * `inThisRequest()`). The changes themselves come from `#lib/server/changes.ts`.
 *
 *     export const watchSchedule = query.live(() => live(["order", "engineer", "customer"]));
 *     export const watchSite = query.live(recordId(), (id) => live({ type: "energy_site", id }));
 */
import { getRequestEvent } from "$app/server";

import {
	ACCESS_REVOKED,
	type ChangeType,
	type FeedAnswer,
	isGone,
	type LoggedType,
	type TenantChange,
} from "#lib/activity/index.ts";
import { readable, visible } from "#lib/server/access/index.ts";
import { type Audience, type Viewer, viewer } from "#lib/server/access/viewer.ts";
import { currentTenant, isEngineer } from "#lib/server/auth/index.ts";
import {
	type Change,
	changedAt,
	recordChangedAt,
	type Revoked,
	watchChanges,
	watchEvery,
	watchSubject,
} from "#lib/server/changes.ts";
import { inThisRequest } from "#lib/server/db/index.ts";
import { timeLiveStream } from "#lib/server/logs/timing.ts";

/** What a live query watches: records of some types, or one record. */
type Watched = readonly ChangeType[] | { type: LoggedType; id: string | number };

/**
 * When the tenant's records of `types` last changed (epoch ms, 0 if not since the server started),
 * answered again after each change (once for a burst). Call it in the live query's function. For
 * one record (and its parts, which are logged with it as their parent), when it last changed: a
 * page that shows one record watches it alone, `live({ type: "energy_site", id })`. Its deletion
 * doesn't count: the page that deleted it goes elsewhere, and another's says so
 * (`<ChangedElsewhere>`).
 */
export function live(watched: Watched): AsyncGenerator<number, void>;
/**
 * What `answer` makes of nothing at first (`null`: a check that refuses goes there, after watching
 * started), then of each change to the tenant's records of the watched types, or to the one
 * watched record (the latest of a burst). An error it throws ends the query.
 */
export function live<T>(
	watched: Watched,
	answer: (change: Change | null) => T | Promise<T>,
): AsyncGenerator<Awaited<T>, void>;
export function live(
	watched: Watched,
	answer?: (change: Change | null) => unknown,
): AsyncGenerator<unknown, void> {
	const { organizationId } = currentTenant();
	const changes =
		"type" in watched
			? watchSubject(organizationId, { type: watched.type, id: String(watched.id) })
			: watchChanges(organizationId, watched);
	return answering(changes, answer ?? answerWhen(organizationId, watched));
}

/** How long a change stays in `liveFeed()`'s answers (ms). */
export const FEED_WINDOW = 10_000;

/** A change as a feed presents it: its record, and when it was made. */
interface FeedChange {
	type: string;
	id: string | null;
	at: number;
}

/**
 * Every change to the current tenant's records of `types`, for the one live query a tab shares
 * (`watchTenantChanges`, `watchFieldChanges`, `watchPortalChanges`): no changes at first, then after each burst, as
 * `present` makes them of its changes (leaving out those the user mustn't hear of: a burst with
 * none left answers nothing). An answer repeats the changes of the last `FEED_WINDOW` ms, so a
 * client that reads only the latest answer (a live query's `current`) misses none that came in
 * quick succession; it tells them apart by when they were made.
 */
export function liveFeed<T extends FeedChange>(
	types: readonly ChangeType[],
	present: (changes: Change[]) => T[] | Promise<T[]>,
): AsyncGenerator<FeedAnswer<T>, void> {
	const { organizationId } = currentTenant();
	const since = Date.now();
	/** The changes in the window, by record, oldest first. */
	const recent = new Map<string, T>();
	return answering(watchEvery(organizationId, types), async (batch) => {
		const presented = batch ? await present(batch) : [];
		if (batch && !presented.length) return skip;
		const now = Date.now();
		for (const change of presented) {
			const key = `${change.type}/${change.id ?? ""}`;
			recent.delete(key);
			recent.set(key, change);
		}
		for (const [key, change] of recent) {
			if (change.at >= now - FEED_WINDOW) break;
			recent.delete(key);
		}
		return { since, now, changes: [...recent.values()] };
	});
}

/**
 * What each audience hears of a change, the work record's `audiences` pattern: whether it is told
 * who made it (`name`), what was done (`action`: `full`, the activity action, or `gone`: only
 * whether the record is gone, `deleted`, or else `updated`), and whether it hears changes
 * announced for a type only, without a record (`ofType`: those say that something of the type
 * changed, which only the office is told). Whether the viewer made the change (`mine`) is told to
 * all: it is their own act. The system has no feed; it hears what the office does.
 */
const hears = {
	office: { name: true, action: "full", ofType: true },
	engineer: { name: false, action: "gone", ofType: false },
	customer: { name: false, action: "gone", ofType: false },
} as const satisfies Record<Exclude<Audience, "system">, object>;

/**
 * The presenter of a shell's feed of changes, for `liveFeed(types, feedFor())`: of a burst, the
 * changes to records the viewer may read (`readable()`, one statement per type: the records of a
 * module that is off, a manager's types for another member, another engineer's orders and so on
 * are never heard of), as `hears` says their audience is told them.
 *
 * A change the viewer may not read is left out, with one exception: when a change revoked their
 * access (an order taken off the engineer: `revokedFrom`), they are told once, as `ACCESS_REVOKED`
 * and nothing more (they knew the record, so it reveals nothing); after it the record is not
 * readable and their page of it gets its 404 on the next refresh. Nor is the deletion of a record
 * outside the office's told (it can no longer be checked against the table). The office reads
 * whole types, so it hears deletions. `asking` is the viewer, the request's by default (call it
 * in the live query).
 */
export function feedFor(
	asking: Viewer | Promise<Viewer> = viewer(),
): (changes: Change[]) => Promise<TenantChange[]> {
	const { user } = currentTenant();
	return async (changes) => {
		const { audience } = await asking;
		const hearing = hears[audience === "system" ? "office" : audience];
		const named = changes.filter((change) => change.id);
		const heard = await readable(named.map((change) => ({ type: change.type, id: change.id! })));
		// A change for its type only is heard as far as the viewer reads the type at all.
		const typesHeard = new Set<string>();
		if (hearing.ofType) {
			const types = new Set(changes.filter((change) => !change.id).map((change) => change.type));
			for (const type of types) if (await visible(type)) typesHeard.add(type);
		}
		// The one exception to reading: someone whose access the change revoked is told so, by the
		// change's own account of whose it was (unless they have it again by the burst's end).
		const revoked = new Set<Change>();
		for (const change of named) {
			if (heard.has(`${change.type}/${change.id}`)) continue;
			for (const from of change.revokedFrom ?? []) {
				if (audience === from.audience && (await isThem(from))) revoked.add(change);
			}
		}
		return changes
			.filter((change) =>
				change.id
					? heard.has(`${change.type}/${change.id}`) || revoked.has(change)
					: typesHeard.has(change.type),
			)
			.map((change) => ({
				type: change.type,
				id: change.id ?? null,
				action: revoked.has(change)
					? ACCESS_REVOKED
					: hearing.action === "full"
						? (change.action ?? "updated")
						: isGone(change.action)
							? "deleted"
							: "updated",
				name: hearing.name ? (change.user?.name ?? "") : "",
				mine: change.user?.id === user.id,
				at: change.at,
			}));
	};
}

/**
 * Whether the signed-in user is the one `from` names. By audience, exhaustively: a second audience
 * in `Revoked` must say how to recognise its person here, not silently reuse the engineer check.
 */
async function isThem(from: Revoked): Promise<boolean> {
	switch (from.audience) {
		case "engineer":
			return isEngineer(from.id);
		default: {
			const unknown: never = from.audience;
			return unknown;
		}
	}
}

/** What a live query's `respond` returns to answer nothing this time (`answering()`). */
const skip = Symbol("skip");

/**
 * What every live query does with what it watches (`changes`): answers at first, then after each
 * change, inside the request; stops watching when the request ends.
 */
function answering<C, T>(
	changes: AsyncGenerator<C, void> & { stop: () => void },
	respond: (change: C | null) => T | typeof skip | Promise<T | typeof skip>,
): AsyncGenerator<Awaited<T>, void> {
	const event = getRequestEvent();
	event.request.signal.addEventListener("abort", changes.stop, { once: true });
	// How long the stream was open, with `TIMING_LOGS` (`#lib/server/logs/timing.ts`).
	const closed = timeLiveStream(event);
	const again = inThisRequest();
	return (async function* () {
		try {
			// The first answer is never skipped.
			yield (await respond(null)) as Awaited<T>;
			for await (const change of changes) {
				const answer = await again(() => respond(change));
				if (answer !== skip) yield answer as Awaited<T>;
			}
		} finally {
			changes.stop();
			closed();
		}
	})();
}

/** What `live()` answers without an `answer`: when the watched records last changed. */
function answerWhen(organizationId: string, watched: Watched) {
	if (!("type" in watched)) return () => changedAt(organizationId, watched);
	const record = { type: watched.type, id: String(watched.id) };
	let at = recordChangedAt(organizationId, record);
	return (change: Change | null) => {
		if (change && !isGone(change.action)) at = change.at;
		return at;
	};
}

/**
 * When a query's data was read (epoch ms, the server's clock), for the data to carry, so its page
 * can tell a change made after the read (`refreshOnChange()`'s and `onRecordChange()`'s read time):
 * one timed later is news. A millisecond earlier, so a change in the same millisecond, after the
 * read, still counts; that asks once too many for one before the read in that millisecond.
 */
export const readAt = () => Date.now() - 1;
