<script lang="ts">
	import { formatDate } from "#lib/i18n";

	import { useCellContext } from "./table.svelte.ts";

	const cell = useCellContext<Date | null>();
	const value = $derived(cell.getValue());
</script>

{#if value}
	<time datetime={value.toISOString()} class="whitespace-nowrap tabular-nums">
		{formatDate(value)}
	</time>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
