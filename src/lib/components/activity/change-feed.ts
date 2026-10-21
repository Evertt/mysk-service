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
import type { LoggedType, TenantChange, TenantChanges } from "#lib/activity/index.ts";

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
	/** The listeners of every change (`subscribeAll()`), and up to when they've been told. */
	readonly #everything = new Set<{
		listener: (change: TenantChange) => void;
		known: number | undefined;
	}>();
	/** The feed's latest answer. */
	#latest: TenantChanges | undefined;
	/**
	 * Each record's latest change the feed told, also while no one watched it: a page that comes
	 * back to it with what it read before (a cached query) hears of it.
	 */
	readonly #lastChanges = new Map<string, TenantChange>();
	/**
	 * When records last changed before the feed's stream started, as asked (`#changedAt`), by
	 * record: asked once per stream.
	 */
	readonly #changedBefore = new Map<string, Promise<number>>();
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
		if (latest) this.#catchUp(subscriber, latest);
		return () => {
			subscribers.delete(subscriber);
			if (!subscribers.size && this.#subscribers.get(key) === subscribers) {
				this.#subscribers.delete(key);
			}
		};
	}

	/**
	 * Calls `listener` on each change the feed tells from now on (to any record, or to a type's),
	 * until the returned function is called: for a page that shows the whole log.
	 */
	subscribeAll(listener: (change: TenantChange) => void) {
		const subscriber = { listener, known: this.#latest?.now };
		this.#everything.add(subscriber);
		return () => {
			this.#everything.delete(subscriber);
		};
	}

	/** Takes the feed's latest answer (a live query's `current`, so some may have been skipped). */
	receive(answer: TenantChanges) {
		if (answer.since !== this.#latest?.since) {
			// Another stream: what was asked about before the last one is asked again.
			this.#changedBefore.clear();
		}
		this.#latest = answer;
		for (const change of answer.changes) {
			if (change.id === null) continue;
			const key = keyOf(change);
			if (change.at > (this.#lastChanges.get(key)?.at ?? 0)) this.#lastChanges.set(key, change);
		}
		for (const subscribers of this.#subscribers.values()) {
			for (const subscriber of subscribers) {
				// Subscribed before the feed's first answer, without a read time: from now on.
				subscriber.known ??= answer.since;
				this.#catchUp(subscriber, answer);
			}
		}
		for (const subscriber of this.#everything) {
			const from = (subscriber.known ??= answer.since);
			subscriber.known = Math.max(from, answer.now);
			for (const change of answer.changes) if (change.at > from) subscriber.listener(change);
		}
	}

	/** Tells `subscriber` of what it hasn't heard of yet, up to `answer`. */
	#catchUp(subscriber: Subscriber, answer: TenantChanges) {
		const from = subscriber.known!;
		subscriber.known = Math.max(from, answer.now);
		const key = keyOf(subscriber.subject);
		const last = this.#lastChanges.get(key);
		if (last && last.at > from) {
			subscriber.listener(last);
		} else if (from < answer.since) {
			// Read before the stream started (the page's first load, or while it reconnected).
			let asked = this.#changedBefore.get(key);
			if (!asked) {
				asked = this.#changedAt(subscriber.subject).catch(() => 0);
				this.#changedBefore.set(key, asked);
			}
			void asked.then((at) => {
				if (at > from && this.#subscribers.get(key)?.has(subscriber)) subscriber.listener(null);
			});
		}
	}
}
