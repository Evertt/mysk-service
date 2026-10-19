<!--
	@component
	The notes engineers wrote on an order, oldest first, each with who wrote it and when; `empty`
	while there are none (nothing without it), then `footer` (e.g. a form to add one).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import { formatDateTime } from "#lib/i18n/index.ts";

	let {
		notes,
		empty,
		footer,
	}: {
		notes: { id: number; text: string; createdAt: Temporal.Instant; author: string | null }[];
		/** Said while there are no notes. */
		empty?: string;
		footer?: Snippet;
	} = $props();
</script>

<div class="flex flex-col gap-4" data-notes>
	{#each notes as note (note.id)}
		<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
			<p class="text-sm whitespace-pre-line">{note.text}</p>
			<span class="text-xs text-muted-foreground">
				{note.author ?? m.orders_report_someone()} · {formatDateTime(note.createdAt)}
			</span>
		</div>
	{:else}
		{#if empty}
			<p class="text-sm text-muted-foreground">{empty}</p>
		{/if}
	{/each}
	{@render footer?.()}
</div>
