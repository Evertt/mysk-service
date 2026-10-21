/**
 * What changed, for live queries (`query.live`): `recordActivity()` announces each change it logs
 * once its transaction has committed, and a live query watches the types of records it shows, or
 * one record, through `live()` (`#lib/server/live.ts`), which is built on `watchChanges()` and
 * `watchSubject()` here.
 *
 * In memory, so it reaches the live queries this process (or isolate) serves. In a Durable Object
 * per organization (the Cloudflare spike, `cloudflare/entry.ts`) that's all of the organization's;
 * on a server with several instances it would need a broker between them.
 */
import type { ChangeType, LoggedType } from "#lib/activity/index.ts";

/**
 * Someone of an audience whose access to a record a change revoked: the engineer's id. Only the
 * engineer exists because only they are told: an order is taken off a named engineer, and their
 * open page and bell should say so. A customer's contact who loses sight of a unit (it moved to a
 * site they don't see) is deliberately not told yet; their page gets its 404 on the next refresh.
 */
export interface Revoked {
	audience: "engineer";
	id: number;
}

/** A change as it's announced: the record (an activity subject's type and id) and who changed it. */
export interface Change {
	/** E.g. `order`. */
	type: ChangeType;
	/** The record's id, as text (as in the activity log), if the announcement names one. */
	id?: string;
	/** What was done, e.g. `updated` (an activity action). */
	action?: string;
	/** Who did it. */
	user?: { id: string; name: string };
	/**
	 * Whose access to the record this change revoked (an order taken off an engineer): only they
	 * are told (`feedFor()`), as the ones who knew the record; it names no one else. Kept when a
	 * later change to the record replaces this one in a batch (`watch()`).
	 */
	revokedFrom?: Revoked[];
	/** When it was announced (epoch ms). */
	at: number;
}

/** What an announcement says besides the type: the record, what was done and by whom. */
type ChangeDetails = Omit<Change, "type" | "at">;

type Listener = (change: Change) => void;

/** The listeners of each organization's changes. */
const listeners = new Map<string, Set<Listener>>();

/** When each organization's records of a type last changed (epoch ms), by `<organization>/<type>`. */
const lastChanged = new Map<string, number>();

/**
 * When each record last changed (epoch ms), by `<organization>/<type>/<id>`: one number per record
 * changed since the server (or the organization's Durable Object) started.
 */
const recordChanged = new Map<string, number>();

/**
 * Tells the organization's live queries that a record of `type` (an activity subject's) changed;
 * `details` names the record and who changed it, for the queries that watch one record.
 */
export function announceChange(
	organizationId: string,
	type: ChangeType,
	details: ChangeDetails = {},
) {
	const change: Change = { ...details, type, at: Date.now() };
	lastChanged.set(`${organizationId}/${type}`, change.at);
	if (details.id) recordChanged.set(`${organizationId}/${type}/${details.id}`, change.at);
	for (const listener of listeners.get(organizationId) ?? []) listener(change);
}

/** When the organization's records of any of `types` last changed here, or 0. */
export const changedAt = (organizationId: string, types: readonly ChangeType[]) =>
	Math.max(0, ...types.map((type) => lastChanged.get(`${organizationId}/${type}`) ?? 0));

/** When the organization's record (or one of its parts) last changed here, or 0. */
export const recordChangedAt = (organizationId: string, record: { type: LoggedType; id: string }) =>
	recordChanged.get(`${organizationId}/${record.type}/${record.id}`) ?? 0;

/**
 * Yields whenever records of `types` change in the organization (the latest change), watching from
 * the call on (not from the first `next()`), and once for a burst of changes that came in while
 * the consumer was busy. `stop()` stops watching: call it in a `finally`, since a generator that
 * was never resumed (a live query during server-side rendering) never runs its own, and when the
 * client goes away, since a consumer waiting for a change can't be stopped otherwise.
 */
export const watchChanges = (organizationId: string, types: readonly ChangeType[]) =>
	latest(
		watch(
			organizationId,
			(change) => types.includes(change.type),
			() => "",
		),
	);

/**
 * Like `watchChanges()`, for one record: yields the latest change announced with its `type` and
 * `id`. A change to one of its parts (an order's line) is announced for it too, as the parent.
 */
export const watchSubject = (organizationId: string, subject: { type: LoggedType; id: string }) =>
	latest(
		watch(
			organizationId,
			(change) => change.type === subject.type && change.id === subject.id,
			() => "",
		),
	);

/**
 * Like `watchChanges()`, losing none of the records: yields the changes of `types` announced since
 * it last yielded, the latest of each record (and of each type, for those announced without one).
 * For the one live query a tab shares (`liveFeed()`).
 */
export const watchEvery = (organizationId: string, types: readonly ChangeType[]) =>
	watch(
		organizationId,
		(change) => types.includes(change.type),
		(change) => `${change.type}/${change.id ?? ""}`,
		true,
	);

/** Each batch's last change, of a watch whose batches hold one (`keyOf` gives them all one key). */
function latest(batches: ReturnType<typeof watch>) {
	return Object.assign(
		(async function* () {
			for await (const batch of batches) yield batch[batch.length - 1];
		})(),
		{ stop: batches.stop },
	);
}

/**
 * Watches the organization's changes that `matches` keeps (see `watchChanges()`), in batches: the
 * changes announced while the consumer was busy, the latest for each `keyOf`.
 */
function watch(
	organizationId: string,
	matches: (change: Change) => boolean,
	keyOf: (change: Change) => string,
	/** Whether `keyOf` is per record, so a replaced change's revocation belongs to the next one. */
	perRecord = false,
) {
	const pending = new Map<string, Change>();
	let stopped = false;
	let wake: (() => void) | undefined;
	const listener: Listener = (change) => {
		if (!matches(change)) return;
		const key = keyOf(change);
		const earlier = perRecord ? pending.get(key)?.revokedFrom : undefined;
		// A later change to the record replaces the pending one, but a revocation is told once: it
		// stays on it. (A watch of many records under one key replaces another record's change.)
		if (earlier) change = { ...change, revokedFrom: [...earlier, ...(change.revokedFrom ?? [])] };
		// Deleted first, so the batch is in the order the changes came.
		pending.delete(key);
		pending.set(key, change);
		wake?.();
	};
	let set = listeners.get(organizationId);
	if (!set) listeners.set(organizationId, (set = new Set()));
	set.add(listener);
	const own = set;

	/** Stops watching, and ends the iteration (also one waiting for a change). */
	function stop() {
		stopped = true;
		wake?.();
		own.delete(listener);
		if (!own.size && listeners.get(organizationId) === own) listeners.delete(organizationId);
	}

	async function* changes(): AsyncGenerator<Change[], void, undefined> {
		try {
			while (!stopped) {
				if (!pending.size) await new Promise<void>((resolve) => (wake = resolve));
				wake = undefined;
				if (stopped || !pending.size) return;
				const batch = [...pending.values()];
				pending.clear();
				yield batch;
			}
		} finally {
			stop();
		}
	}

	return Object.assign(changes(), { stop });
}
