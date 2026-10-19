<!--
	@component
	Activity log entries, newest first: "Anouk de Vries updated order ORD-2026-00012", with the
	changed fields and when. Subjects link to their page while they exist.
-->
<script lang="ts">
	import { formatDateTime } from "#lib/i18n/index.ts";
	import type { ActivityEntry } from "#lib/server/activity/index.ts";

	import ActivitySentence from "./activity-sentence.svelte";

	let {
		entries,
		label = m.activity_log(),
		empty = m.activity_none_description(),
	}: {
		entries: ActivityEntry[];
		/** The list's accessible name. */
		label?: string;
		/** What it says without entries. */
		empty?: string;
	} = $props();
</script>

{#if entries.length}
	<ul aria-label={label} class="flex flex-col divide-y">
		{#each entries as entry (entry.id)}
			<li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0" data-activity={entry.id}>
				<p><ActivitySentence {entry} /></p>
				{#if entry.changes.length}
					<ul class="flex flex-col gap-0.5 text-muted-foreground">
						{#each entry.changes as change (change.field)}
							<li class="break-words">
								{change.field}:
								{#if change.summary}
									<span class="text-foreground">{change.summary}</span>
								{:else}
									<span class="text-foreground/80">{change.before}</span>
									→
									<span class="text-foreground">{change.after}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if entry.note}
					<p class="text-muted-foreground italic">{entry.note}</p>
				{/if}
				<time datetime={entry.at.toString()} class="text-xs text-muted-foreground tabular-nums">
					{formatDateTime(entry.at)}
				</time>
			</li>
		{/each}
	</ul>
{:else}
	<Empty.Root class="p-6">
		<Empty.Header>
			<Empty.Title>{m.activity_none()}</Empty.Title>
			<Empty.Description>{empty}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
