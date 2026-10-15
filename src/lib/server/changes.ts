/**
 * What changed, for live queries (`query.live`): `recordActivity()` announces each change it logs
 * once its transaction has committed, and a live query watches the types of records it shows.
 *
 * In memory, so it reaches the live queries this process (or isolate) serves. In a Durable Object
 * per organization (the Cloudflare spike, `cloudflare/entry.ts`) that's all of the organization's;
 * on a server with several instances it would need a broker between them.
 */

type Listener = (type: string) => void;

/** The listeners of each organization's changes. */
const listeners = new Map<string, Set<Listener>>();

/** When each organization's records of a type last changed (epoch ms), by `<organization>/<type>`. */
const lastChanged = new Map<string, number>();

/** Tells the organization's live queries that a record of `type` (an activity subject's) changed. */
export function announceChange(organizationId: string, type: string) {
	lastChanged.set(`${organizationId}/${type}`, Date.now());
	for (const listener of listeners.get(organizationId) ?? []) listener(type);
}

/** When the organization's records of any of `types` last changed here, or 0. */
export const changedAt = (organizationId: string, types: readonly string[]) =>
	Math.max(0, ...types.map((type) => lastChanged.get(`${organizationId}/${type}`) ?? 0));

/**
 * Yields whenever records of `types` change in the organization, watching from the call on (not
 * from the first `next()`), and once for a burst of changes that came in while the consumer was
 * busy. `stop()` stops watching: call it in a `finally`, since a generator that was never resumed
 * (a live query during server-side rendering) never runs its own, and when the client goes away,
 * since a consumer waiting for a change can't be stopped otherwise.
 */
export function watchChanges(organizationId: string, types: readonly string[]) {
	let pending = false;
	let stopped = false;
	let wake: (() => void) | undefined;
	const listener: Listener = (type) => {
		if (!types.includes(type)) return;
		pending = true;
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

	async function* changes() {
		try {
			while (!stopped) {
				if (!pending) await new Promise<void>((resolve) => (wake = resolve));
				wake = undefined;
				if (stopped) return;
				pending = false;
				yield;
			}
		} finally {
			stop();
		}
	}

	return Object.assign(changes(), { stop });
}
