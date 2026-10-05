<!--
	@component
	A customer's name linking to their page; with `withCode`, their code is shown below it (e.g. in
	table cells).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";

	let {
		code,
		name,
		withCode = false,
	}: { code: string; name: string; withCode?: boolean } = $props();

	const href = $derived(resolve("/(app)/customers/[code]", { code }));
</script>

{#if withCode}
	<TwoLineCell primary={name} secondary={code} {href} />
{:else}
	<a {href} class="font-medium underline-offset-4 hover:underline">{name}</a>
{/if}
