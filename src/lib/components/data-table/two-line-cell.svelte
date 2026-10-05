<!--
	@component
	A primary value with a muted detail line below it, e.g. a name and its code. With `href` the
	primary value links there. Shows `fallback` in muted text when there's no primary value.
-->
<script lang="ts">
	let {
		primary,
		secondary,
		href,
		fallback = "—",
	}: {
		primary?: string | null;
		secondary?: string | null;
		href?: string;
		fallback?: string;
	} = $props();
</script>

{#if primary}
	<div class="flex max-w-64 flex-col">
		{#if href}
			<a {href} class="truncate font-medium underline-offset-4 hover:underline">{primary}</a>
		{:else}
			<span class="truncate">{primary}</span>
		{/if}
		{#if secondary}
			<span class="truncate text-xs text-muted-foreground">{secondary}</span>
		{/if}
	</div>
{:else}
	<span class="text-muted-foreground">{fallback}</span>
{/if}
