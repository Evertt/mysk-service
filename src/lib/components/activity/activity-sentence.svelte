<!--
	@component
	An activity entry's sentence: "Anouk de Vries updated order ORD-2026-00012", the subject (and the
	record it's part of) linked to its page while it exists. `href` links them elsewhere (the engineer
	portal's own pages), or not at all (`null`).
-->
<script lang="ts">
	import { actionSentence, subjectHref } from "#lib/activity/index.ts";
	import { messageParts } from "#lib/i18n/index.ts";
	import type { ActivityEntry, SubjectLink } from "#lib/server/activity/index.ts";

	let {
		entry,
		href = (link) => (link.target ? subjectHref(link.type, link.target) : null),
	}: {
		entry: ActivityEntry;
		/** Where a subject links to; by default its page in the office. */
		href?: (link: SubjectLink) => string | null;
	} = $props();

	/** The sentence, with slots for the user and the subject (see `#lib/activity/subjects.ts`). */
	const sentence = $derived(
		messageParts<"user" | "subject">((slot) =>
			actionSentence(entry.action)({ user: slot("user"), subject: slot("subject") }),
		),
	);

	/** A subject that is part of another record: "order line X on order Y". */
	const ofParent = $derived(
		messageParts<"subject" | "parent">((slot) =>
			m.activity_subject_of_parent({ subject: slot("subject"), parent: slot("parent") }),
		),
	);
</script>

{#snippet subject(link: SubjectLink)}
	{@const to = href(link)}
	<!-- A subject without a label of its own (e.g. a module's settings) is its noun. -->
	{@const [noun, label] = link.label ? [`${link.noun} `, link.label] : ["", link.noun]}
	{noun}{#if to}<a href={to} class="font-medium underline-offset-4 hover:underline">{label}</a
		>{:else}<span class="font-medium">{label}</span>{/if}
{/snippet}

{#snippet subjectOf()}
	{#if entry.parent}
		{@const parent = entry.parent}
		{#each ofParent as part, i (i)}{#if "text" in part}{part.text}{:else if part.slot === "subject"}{@render subject(
					entry.subject,
				)}{:else}{@render subject(parent)}{/if}{/each}
	{:else}
		{@render subject(entry.subject)}
	{/if}
{/snippet}

{#each sentence as part, i (i)}{#if "text" in part}{part.text}{:else if part.slot === "user"}<span
			class="font-medium">{entry.user}</span
		>{:else}{@render subjectOf()}{/if}{/each}
