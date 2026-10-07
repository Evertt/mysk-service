<!--
	@component
	Activity log entries, newest first: "Avery Admin updated order ORD-2026-00012", with the
	changed fields and when. Subjects link to their page while they exist.
-->
<script lang="ts">
	import { subjectHref } from "#lib/activity.js";
	import { formatDateTime } from "#lib/format.js";

	import type { ActivityEntry, SubjectLink } from "./activity.remote.js";

	let {
		entries,
		label = "Activity log",
		empty = "Nothing has changed yet.",
	}: {
		entries: ActivityEntry[];
		/** The list's accessible name. */
		label?: string;
		/** What it says without entries. */
		empty?: string;
	} = $props();
</script>

{#snippet subject(link: SubjectLink)}
	{@const href = link.target && subjectHref(link.type, link.target)}
	{link.noun}
	{#if href}
		<a {href} class="font-medium underline-offset-4 hover:underline">{link.label}</a>
	{:else}
		<span class="font-medium">{link.label}</span>
	{/if}
{/snippet}

{#if entries.length}
	<ul aria-label={label} class="flex flex-col divide-y">
		{#each entries as entry (entry.id)}
			<li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0" data-activity={entry.id}>
				<p>
					<span class="font-medium">{entry.user}</span>
					{entry.verb}
					{@render subject(entry.subject)}
					{#if entry.parent}
						on {@render subject(entry.parent)}
					{/if}
				</p>
				{#if entry.changes.length}
					<ul class="flex flex-col gap-0.5 text-muted-foreground">
						{#each entry.changes as change (change.field)}
							<li class="break-words">
								{change.field}:
								<span class="text-foreground/80">{change.before}</span>
								→
								<span class="text-foreground">{change.after}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if entry.note}
					<p class="text-muted-foreground italic">{entry.note}</p>
				{/if}
				<time datetime={entry.at.toISOString()} class="text-xs text-muted-foreground tabular-nums">
					{formatDateTime(entry.at)}
				</time>
			</li>
		{/each}
	</ul>
{:else}
	<Empty.Root class="p-6">
		<Empty.Header>
			<Empty.Title>No activity</Empty.Title>
			<Empty.Description>{empty}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
