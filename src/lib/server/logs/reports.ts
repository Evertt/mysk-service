/**
 * The limits on what browsers report (`reportClientError`, `#lib/errors/report.remote.ts`), which
 * anyone may call: at most `REPORTS_PER_MINUTE` per session (or, signed out, per address), and each
 * error id once. In memory: on Cloudflare one Durable Object answers every request, and on Node one
 * process, so a counter there sees them all (a restart forgets them, which is fine).
 */
export const REPORTS_PER_MINUTE = 20;

const minute = 60_000;

/** How many error ids are remembered, at most; then the oldest are forgotten first. */
const rememberedIds = 5_000;

/** Reports per sender in their current minute. */
const senders = new Map<string, { since: number; count: number }>();

/** The error ids reported, oldest first (a `Set` keeps the order it was filled in). */
const reported = new Set<string>();

/**
 * Whether to log a report of `errorId` from `sender` (a session id or an address) now: not if the
 * sender reported `REPORTS_PER_MINUTE` already this minute, or anyone reported this error before.
 */
export function admitReport(sender: string, errorId: string, now = Date.now()): boolean {
	if (reported.has(errorId)) return false;

	let window = senders.get(sender);
	if (!window || now - window.since >= minute) {
		// Forgets the senders whose minute is over, now and then, so the map doesn't grow.
		if (senders.size > 1_000) {
			for (const [key, value] of senders) if (now - value.since >= minute) senders.delete(key);
		}
		window = { since: now, count: 0 };
		senders.set(sender, window);
	}
	if (window.count >= REPORTS_PER_MINUTE) return false;
	window.count += 1;

	reported.add(errorId);
	if (reported.size > rememberedIds) reported.delete(reported.values().next().value!);
	return true;
}
