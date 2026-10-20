<!--
	@component
	A notice on a record's page when someone else changes the record while it's open ("Changed by
	Anouk de Vries · 1 minute ago"), with a button that loads the latest version, so a save doesn't
	quietly undo their changes. Nothing for the user's own changes. It follows the record through the
	tab's feed of changes (`onRecordChange()`, `change-feed.svelte.ts`), for the types in
	`watchedTypes` (`./watched.ts`). `RecordPage` shows it on
	a record's page; an edit page shows it above its form, with `onreload`.
-->
<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import RefreshIcon from "@lucide/svelte/icons/refresh-ccw";

	import { Clock } from "#lib/hooks/clock.svelte.ts";
	import { formatTimeAgo } from "#lib/i18n/index.ts";

	import type { TenantChange } from "./activity.remote.ts";
	import { onRecordChange } from "./change-feed.svelte.ts";
	import type { WatchedType } from "./watched.ts";

	let {
		type,
		id,
		onreload,
	}: {
		/** The record's activity subject type, e.g. `order`. */
		type: WatchedType;
		id: number;
		/**
		 * Runs once the page has the latest version, e.g. to start its form afresh (a remote form
		 * keeps what was typed, which would cover the latest values).
		 */
		onreload?: () => void;
	} = $props();

	/** The latest change someone else made, of the record it was made to. */
	let shown = $state<{ record: string; change: TenantChange }>();
	const record = $derived(`${type}/${id}`);
	const change = $derived(shown?.record === record ? shown.change : undefined);
	const at = $derived(change && Temporal.Instant.fromEpochMilliseconds(change.at));
	onRecordChange(
		() => ({ type, id }),
		// Only what the feed tells: a change it can't tell (`null`) has no one to name.
		(latest) => {
			if (latest && !latest.mine) shown = { record: `${latest.type}/${latest.id}`, change: latest };
		},
	);

	// "1 minute ago" moves on while it shows.
	const clock = new Clock(30_000);

	let reloading = $state(false);
	async function reload() {
		reloading = true;
		try {
			await refreshAll();
			onreload?.();
			shown = undefined;
		} finally {
			reloading = false;
		}
	}
</script>

<!-- No box of its own, so it takes no room in the page's layout while there's nothing to say. -->
<div role="status" aria-live="polite" class="contents">
	{#if change}
		{@const deleted = change.action === "deleted"}
		<Card.Root size="sm" data-changed-elsewhere={change.action}>
			<Card.Content class="flex flex-row items-center gap-3">
				<HistoryIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<p class="font-medium">
						{deleted
							? m.activity_deleted_elsewhere({ name: change.name })
							: m.activity_changed_elsewhere({ name: change.name })}
						<span class="font-normal text-muted-foreground">
							· <time datetime={at!.toString()}>{formatTimeAgo(at!, clock.now)}</time>
						</span>
					</p>
					<p class="text-muted-foreground">
						{deleted
							? m.activity_deleted_elsewhere_description()
							: m.activity_changed_elsewhere_description()}
					</p>
				</div>
				{#if !deleted}
					<Button variant="outline" size="sm" disabled={reloading} onclick={reload}>
						<RefreshIcon data-icon="inline-start" />
						{m.activity_changed_elsewhere_reload()}
					</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
