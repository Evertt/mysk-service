<script lang="ts">
	import { formatDate } from "#lib/i18n/index.ts";

	import { useCellContext } from "./table.svelte.ts";

	const cell = useCellContext<Temporal.PlainDate | Temporal.Instant | null>();
	const value = $derived(cell.getValue());
</script>

{#if value}
	<time datetime={value.toString()} class="whitespace-nowrap tabular-nums">
		{formatDate(value)}
	</time>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
