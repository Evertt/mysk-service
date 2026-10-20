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

import type { ChangeType, LoggedType } from "#lib/activity/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import {
	type Change,
	changedAt,
	recordChangedAt,
	watchChanges,
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
	const event = getRequestEvent();
	event.request.signal.addEventListener("abort", changes.stop, { once: true });
	// How long the stream was open, with `TIMING_LOGS` (`#lib/server/logs/timing.ts`).
	const closed = timeLiveStream(event);
	const again = inThisRequest();
	const respond = answer ?? answerWhen(organizationId, watched);
	return (async function* () {
		try {
			yield await respond(null);
			for await (const change of changes) yield await again(() => respond(change));
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
		if (change && change.action !== "deleted" && change.action !== "removed") at = change.at;
		return at;
	};
}

/**
 * When the tenant's records of `types` (or one record) last changed, for a query's data to carry, so its page can
 * tell whether its live query's first answer is newer than the data (`refreshOnChange()`'s read
 * time). Changes are timed in milliseconds, so one in this millisecond reads a millisecond earlier:
 * another change in the same millisecond, after the read, still counts as newer. That asks once
 * too many when there's none, which takes reading in the millisecond of a change.
 */
export function readAt(watched: Watched) {
	const { organizationId } = currentTenant();
	const changed =
		"type" in watched
			? recordChangedAt(organizationId, { type: watched.type, id: String(watched.id) })
			: changedAt(organizationId, watched);
	return changed && changed >= Date.now() ? changed - 1 : changed;
}
