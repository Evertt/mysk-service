<!--
	@component
	Activity log entries, newest first: "Anouk de Vries updated order ORD-2026-00012", with the
	changed fields and when. Subjects link to their page while they exist.
-->
<script lang="ts">
	import { actionSentence, subjectHref } from "#lib/activity/subjects.ts";
	import { formatDateTime } from "#lib/format.ts";
	import { messageParts } from "#lib/i18n/parts.ts";
	import type { ActivityEntry, SubjectLink } from "#lib/server/activity/feed.ts";

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

	/** An entry's sentence, with slots for the user and the subject (see `#lib/activity/subjects.ts`). */
	const sentence = (entry: ActivityEntry) =>
		messageParts<"user" | "subject">((slot) =>
			actionSentence(entry.action)({ user: slot("user"), subject: slot("subject") }),
		);

	/** A subject that is part of another record: "order line X on order Y". */
	const ofParent = () =>
		messageParts<"subject" | "parent">((slot) =>
			m.activity_subject_of_parent({ subject: slot("subject"), parent: slot("parent") }),
		);
</script>

{#snippet subject(link: SubjectLink)}
	{@const href = link.target && subjectHref(link.type, link.target)}
	<!-- A subject without a label of its own (e.g. a module's settings) is its noun. -->
	{@const [noun, label] = link.label ? [`${link.noun} `, link.label] : ["", link.noun]}
	{noun}{#if href}<a {href} class="font-medium underline-offset-4 hover:underline">{label}</a
		>{:else}<span class="font-medium">{label}</span>{/if}
{/snippet}

{#snippet subjectOf(entry: ActivityEntry)}
	{#if entry.parent}
		{@const parent = entry.parent}
		{#each ofParent() as part, i (i)}{#if "text" in part}{part.text}{:else if part.slot === "subject"}{@render subject(
					entry.subject,
				)}{:else}{@render subject(parent)}{/if}{/each}
	{:else}
		{@render subject(entry.subject)}
	{/if}
{/snippet}

{#if entries.length}
	<ul aria-label={label} class="flex flex-col divide-y">
		{#each entries as entry (entry.id)}
			<li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0" data-activity={entry.id}>
				<p>
					{#each sentence(entry) as part, i (i)}{#if "text" in part}{part.text}{:else if part.slot === "user"}<span
								class="font-medium">{entry.user}</span
							>{:else}{@render subjectOf(entry)}{/if}{/each}
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
			<Empty.Title>{m.activity_none()}</Empty.Title>
			<Empty.Description>{empty}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
