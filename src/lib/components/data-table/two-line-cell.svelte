<!--
	@component
	A primary value with a muted detail line below it, e.g. a name and its code. Shows `fallback`
	in muted text when there's no primary value.
-->
<script lang="ts">
	let {
		primary,
		secondary,
		fallback = "—",
	}: { primary?: string | null; secondary?: string | null; fallback?: string } = $props();
</script>

{#if primary}
	<div class="flex max-w-56 flex-col">
		<span class="truncate">{primary}</span>
		{#if secondary}
			<span class="truncate text-xs text-muted-foreground">{secondary}</span>
		{/if}
	</div>
{:else}
	<span class="text-muted-foreground">{fallback}</span>
{/if}
