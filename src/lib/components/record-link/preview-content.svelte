<!--
	@component
	The content of a record link's hover card (`RecordLink`): `children` with the record that `load`
	answers (the record's batch query, which its page shares), asked for when the card opens unless
	the link already did; a skeleton meanwhile, and "Not found" for a record that's gone or another
	tenant's, never an error.

	The card keeps the answer in a state of its own rather than reading the query in its markup
	(`await`, `{#await}`): SvelteKit's preload of the link's page renders in a fork, and a card whose
	markup waited on a query while the fork was pending was held up with it (its position was never
	computed, so it stayed off the screen). Links in it have no card of their own.
-->
<script lang="ts" generics="T">
	import { resource } from "runed";
	import type { Snippet } from "svelte";

	import { classify } from "#lib/errors/classify.ts";

	import { hideRecordPreviews } from "./previews.ts";

	let { load, children }: { load: () => PromiseLike<T>; children: Snippet<[T]> } = $props();

	hideRecordPreviews();

	/**
	 * A query first asked for in SvelteKit's preload fork (the pointer rested on the link before it
	 * could ask, see `RecordLink`) answers this outside the fork. Asking again gives an answer of the
	 * page's own.
	 */
	const forksAnswer = (error: unknown) =>
		(error as { body?: { message?: unknown } } | null)?.body?.message ===
		"Query resolved without a value";

	const answer = resource(
		() => load() as PromiseLike<T> & { refresh?: () => Promise<void> },
		async (query, _, { signal }): Promise<{ record: T }> => {
			let record: T;
			try {
				record = await query;
			} catch (error) {
				if (!forksAnswer(error) || !query.refresh) throw error;
				await query.refresh();
				record = await query;
			}
			signal.throwIfAborted();
			return { record };
		},
	);
</script>

{#if answer.current}
	{@render children(answer.current.record)}
{:else if answer.error}
	<!-- A refusal is a record that's gone, or another tenant's. -->
	<p class="text-muted-foreground" data-record-preview-failed>
		{classify(answer.error) === "http" ? m.common_error_not_found() : m.common_preview_failed()}
	</p>
{:else}
	<div class="flex flex-col gap-3" data-record-preview-loading>
		<Skeleton class="h-5 w-32" />
		<Skeleton class="h-4 w-48" />
		<div class="grid grid-cols-2 gap-3">
			<Skeleton class="h-8" />
			<Skeleton class="h-8" />
			<Skeleton class="h-8" />
			<Skeleton class="h-8" />
		</div>
	</div>
{/if}
