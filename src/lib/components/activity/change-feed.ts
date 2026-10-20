/**
 * Who in an office tab watches which record, and telling them when it changes: `ChangeFeed` takes
 * the answers of the tab's one feed of the tenant's changes (`watchTenantChanges`) and calls the
 * listeners of each changed record. `change-feed.svelte.ts` connects it to the feed and to the
 * components (`onRecordChange()`).
 *
 * One live query, whose key never changes, instead of one per record: SvelteKit closes a live
 * query's stream only once the browser has collected its last handle, so a page's streams outlived
 * it, and over HTTP/1.1 they took the connections the next page needed
 * (`docs/upstream-bugs/README.md`, 14). A listener comes and goes with its component instead.
 */
import type { LoggedType } from "#lib/activity/index.ts";

import type { TenantChange, TenantChanges } from "./activity.remote.ts";

/** A record of the tenant, as the activity log names it. */
export interface Subject {
	type: LoggedType;
	id: string | number;
}

/**
 * Called with each change to the record, or with `null` for one the feed can't tell, made before
 * it was watching (after the component read the record, or while the feed reconnected).
 */
export type ChangeListener = (change: TenantChange | null) => void;

interface Subscriber {
	subject: Subject;
	listener: ChangeListener;
	/** Up to when (the server's clock) its changes have been told, or not known yet. */
	known: number | undefined;
}

const keyOf = (subject: { type: string; id: string | number | null }) =>
	`${subject.type}/${subject.id}`;

export class ChangeFeed {
	readonly #subscribers = new Map<string, Set<Subscriber>>();
	/** The feed's latest answer. */
	#latest: TenantChanges | undefined;
	readonly #changedAt: (subject: Subject) => Promise<number>;

	/** @param changedAt When a record last changed, asked afresh, for what the feed can't tell. */
	constructor(changedAt: (subject: Subject) => Promise<number>) {
		this.#changedAt = changedAt;
	}

	/**
	 * Calls `listener` on each change to `subject` from now on, until the returned function is
	 * called. With `readTime` (when the component read the record, `readAt()` on the server), also
	 * for a change made since then.
	 */
	subscribe(subject: Subject, listener: ChangeListener, readTime?: number) {
		const latest = this.#latest;
		const subscriber: Subscriber = { subject, listener, known: readTime ?? latest?.now };
		const key = keyOf(subject);
		let subscribers = this.#subscribers.get(key);
		if (!subscribers) this.#subscribers.set(key, (subscribers = new Set()));
		subscribers.add(subscriber);
		if (latest && subscriber.known !== undefined) {
			if (subscriber.known < latest.since) this.#catchUp(subscriber, latest.since);
			// Told before it subscribed, but after it read the record.
			this.#tell(
				subscriber,
				latest.changes.filter((change) => keyOf(change) === key),
			);
			subscriber.known = Math.max(subscriber.known, latest.now);
		}
		return () => {
			subscribers.delete(subscriber);
			if (!subscribers.size && this.#subscribers.get(key) === subscribers) {
				this.#subscribers.delete(key);
			}
		};
	}

	/** Takes the feed's latest answer (a live query's `current`, so some may have been skipped). */
	receive(answer: TenantChanges) {
		const reconnected = answer.since !== this.#latest?.since;
		this.#latest = answer;
		const changed = new Map<string, TenantChange[]>();
		for (const change of answer.changes) {
			if (change.id === null) continue;
			const key = keyOf(change);
			changed.set(key, [...(changed.get(key) ?? []), change]);
		}
		for (const [key, subscribers] of this.#subscribers) {
			for (const subscriber of subscribers) {
				if (subscriber.known === undefined) {
					// Subscribed before the feed's first answer, without a read time: from now on.
					subscriber.known = answer.since;
				} else if (reconnected && subscriber.known < answer.since) {
					this.#catchUp(subscriber, answer.since);
				}
				this.#tell(subscriber, changed.get(key) ?? []);
				subscriber.known = Math.max(subscriber.known, answer.now);
			}
		}
	}

	/** Tells `subscriber` of those of `changes` it hasn't heard of. */
	#tell(subscriber: Subscriber, changes: TenantChange[]) {
		for (const change of changes) {
			if (change.at > subscriber.known!) subscriber.listener(change);
		}
	}

	/** Asks whether `subscriber`'s record changed between what it knows and `since`. */
	#catchUp(subscriber: Subscriber, since: number) {
		const from = subscriber.known!;
		subscriber.known = since;
		void this.#changedAt(subscriber.subject).then(
			(at) => {
				if (at > from && this.#subscribers.get(keyOf(subscriber.subject))?.has(subscriber)) {
					subscriber.listener(null);
				}
			},
			// The feed's next change tells it anyway.
			() => {},
		);
	}
}
