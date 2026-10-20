/**
 * The office tab's one feed of the tenant's changes, for the components that follow a record:
 * `provideChangeFeed()` in the office's layout opens it (`watchTenantChanges`), and
 * `onRecordChange()` / `refreshOnRecordChange()` subscribe a component to a record for as long as
 * it's mounted. See `change-feed.ts` for why one feed.
 */
import { createContext, untrack } from "svelte";

import { isGone } from "#lib/activity/index.ts";

import { getRecordChangedAt, watchTenantChanges } from "./activity.remote.ts";
import { type ChangeListener, ChangeFeed, type Subject } from "./change-feed.ts";

const [getChangeFeed, setChangeFeed] = createContext<ChangeFeed>();

/** Opens the tab's feed for the component's children (the office shell). */
export function provideChangeFeed() {
	const feed = setChangeFeed(
		new ChangeFeed(async (subject) => {
			// Asked afresh: a cached answer would be from an earlier visit.
			const query = getRecordChangedAt(subject);
			await query.refresh();
			return query.current ?? 0;
		}),
	);
	// Made once, so its key and its stream stay as long as the shell.
	const changes = watchTenantChanges();
	$effect(() => {
		const answer = changes.current;
		if (answer) untrack(() => feed.receive(answer));
	});
}

/**
 * Calls `listener` on each change to the record `subject` gives (none: no record yet), while the
 * component is mounted (see `ChangeFeed.subscribe()` for `readTime`). Call it while a component
 * initializes, inside the office shell. `listener` runs untracked.
 */
export function onRecordChange(
	subject: () => Subject | false | null | undefined,
	listener: ChangeListener,
	readTime?: () => number,
) {
	const feed = getChangeFeed();
	$effect(() => {
		const watched = subject();
		if (!watched) return;
		return untrack(() =>
			feed.subscribe(watched, (change) => untrack(() => listener(change)), readTime?.()),
		);
	});
}

/**
 * Calls `refresh` when the record `subject` gives changes, but for its deletion (the page that
 * deleted it goes elsewhere, another's says so: `<ChangedElsewhere>`). With `readTime` (the data's,
 * `readAt()` on the server), also for a change made after the data was read.
 */
export function refreshOnRecordChange(
	subject: () => Subject | false | null | undefined,
	refresh: () => unknown,
	readTime?: () => number,
) {
	onRecordChange(
		subject,
		(change) => {
			if (!isGone(change?.action)) refresh();
		},
		readTime,
	);
}
