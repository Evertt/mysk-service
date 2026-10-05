<!--
	@component
	A link to a unit's detail page, showing its serial number unless `children` say otherwise.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";

	let { serialNumber, children }: { serialNumber: string; children?: Snippet } = $props();
</script>

<a
	href={resolve("/(app)/equipment/[serial]", { serial: serialNumber })}
	class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
>
	{#if children}
		{@render children()}
	{:else}
		{serialNumber}
	{/if}
</a>
