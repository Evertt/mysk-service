/**
 * A tab's one feed of the tenant's changes, for the components that follow a record:
 * `provideChangeFeed()` in a shell's layout opens it (the office's `watchTenantChanges`, the
 * engineer portal's `watchFieldChanges`), and
 * `onRecordChange()` / `refreshOnRecordChange()` subscribe a component to a record for as long as
 * it's mounted (`onAnyChange()` to all of them). See `change-feed.ts` for why one feed.
 */
import { createContext, untrack } from "svelte";

import {
	isGone,
	ACCESS_REVOKED,
	type TenantChange,
	type TenantChanges,
} from "#lib/activity/index.ts";

import { getRecordChangedAt } from "./activity.remote.ts";
import { type ChangeListener, ChangeFeed, type Subject } from "./change-feed.ts";

const [getChangeFeed, setChangeFeed] = createContext<ChangeFeed>();

/**
 * Opens the tab's feed for the component's children (a shell): `watch`, the shell's live query of
 * the changes its user may hear of.
 */
export function provideChangeFeed(watch: () => { readonly current: TenantChanges | undefined }) {
	const feed = setChangeFeed(
		new ChangeFeed(async (subject) => {
			// Asked afresh: a cached answer would be from an earlier visit.
			const query = getRecordChangedAt(subject);
			await query.refresh();
			return query.current ?? 0;
		}),
	);
	// Made once, so its key and its stream stay as long as the shell.
	const changes = watch();
	$effect(() => {
		const answer = changes.current;
		if (answer) untrack(() => feed.receive(answer));
	});
}

/**
 * Calls `listener` on each change to the record `subject` gives (none: no record yet), while the
 * component is mounted (see `ChangeFeed.subscribe()` for `readTime`). Call it while a component
 * initializes, inside a shell with a feed (the office, the engineer portal). `listener` runs
 * untracked.
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
			if (!isGone(change?.action) && change?.action !== ACCESS_REVOKED) refresh();
		},
		readTime,
	);
}

/**
 * Calls `listener` on each change the tab's feed tells (to any record), while the component is
 * mounted: a page that shows the whole log (`refreshOnActivity()`). Call it while a component
 * initializes, inside a shell with a feed. `listener` runs untracked.
 */
export function onAnyChange(listener: (change: TenantChange) => void) {
	const feed = getChangeFeed();
	$effect(() => untrack(() => feed.subscribeAll((change) => untrack(() => listener(change)))));
}
