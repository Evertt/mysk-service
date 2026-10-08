<!--
	@component
	The toolbar's "Saved views" menu, for a table that keeps its state in the URL (see
	`saved-views.svelte`); nothing for one that doesn't. It loads on its own, so the table doesn't
	wait for it.
-->
<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";

	import SavedViews from "./saved-views.svelte";
	import { useTableContext } from "./table.svelte.js";
	import { tableUrlSync } from "./url-sync.svelte.js";

	const table = useTableContext();
	const sync = tableUrlSync(table);
</script>

{#if sync}
	<svelte:boundary>
		<SavedViews {sync} />
		{#snippet pending()}
			<Button variant="outline" size="sm" disabled>
				<BookmarkIcon data-icon="inline-start" />
				{m.common_views_menu()}
			</Button>
		{/snippet}
		<!-- The table works without its views. -->
		{#snippet failed()}{/snippet}
	</svelte:boundary>
{/if}
