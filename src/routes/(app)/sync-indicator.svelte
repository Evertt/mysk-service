<!--
	@component
	Shows, in the header, that the page shows answers from the service worker's cache while the worker
	asks the server for newer ones (`swr-worker.ts`): a cloud with a turning arrow, like a document
	being saved. Only once that has taken a moment, so a quick check doesn't flicker.
-->
<script lang="ts">
	import CloudIcon from "@lucide/svelte/icons/cloud";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { Debounced } from "runed";

	import { revalidating } from "./swr-worker.ts";

	/** How long the worker has to be checking before the indicator shows. */
	const showAfter = 150;

	const checking = $derived(revalidating.size > 0);
	const settled = new Debounced(() => checking, showAfter);
	/** Hidden at once when the check is done. */
	const shown = $derived(checking && settled.current);
</script>

<div role="status" class="flex size-8 items-center justify-center text-muted-foreground">
	{#if shown}
		<span class="relative flex" title={m.common_sync_checking()} data-slot="sync-indicator">
			<CloudIcon class="size-5" aria-hidden="true" />
			<RefreshCwIcon
				class="absolute top-[8px] left-[6.5px] size-2 animate-spin [animation-duration:1.5s]"
				strokeWidth={3}
				aria-hidden="true"
			/>
			<span class="sr-only">{m.common_sync_checking()}</span>
		</span>
	{/if}
</div>
