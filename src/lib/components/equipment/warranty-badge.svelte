<!--
	@component
	Whether a unit's warranty covers work done at `at` (now by default): "Covered" or "Expired".
-->
<script lang="ts">
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import ShieldOffIcon from "@lucide/svelte/icons/shield-off";

	import { isUnderWarranty } from "./display.js";

	let { until, at }: { until: Date; at?: Date } = $props();

	const covered = $derived(isUnderWarranty(until, at));
</script>

<Badge variant={covered ? "secondary" : "outline"}>
	{#if covered}
		<ShieldCheckIcon data-icon="inline-start" />
		{m.equipment_warranty_covered()}
	{:else}
		<ShieldOffIcon data-icon="inline-start" />
		{m.equipment_warranty_expired()}
	{/if}
</Badge>
