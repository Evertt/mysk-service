<!--
	@component
	A customer's name linking to their page; with `withCode`, their code is shown below it (e.g. in
	table cells).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	let {
		code,
		name,
		withCode = false,
	}: { code: string; name: string; withCode?: boolean } = $props();

	const href = $derived(resolve("/(app)/customers/[code]", { code }));
</script>

{#if withCode}
	<div class="flex max-w-56 flex-col">
		<a {href} class="truncate font-medium underline-offset-4 hover:underline">{name}</a>
		<span class="truncate text-xs text-muted-foreground">{code}</span>
	</div>
{:else}
	<a {href} class="font-medium underline-offset-4 hover:underline">{name}</a>
{/if}
