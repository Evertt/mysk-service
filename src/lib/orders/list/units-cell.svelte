<!--
	@component
	The orders list's units cell: the order's first unit, linked to its page, with its make and serial
	number below, and how many more units the order has ("+14"); "New installation" without units.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
	import { unitModel, unitTitle } from "#lib/equipment/index.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	let {
		first,
		count,
	}: {
		/** The first of the order's units, if it has any. */
		first: {
			name: string | null;
			manufacturer: string;
			model: string;
			serialNumber: string;
		} | null;
		/** How many units the order has, the first one included. */
		count: number;
	} = $props();

	const more = $derived(first ? Math.max(0, count - 1) : 0);
</script>

<div class="flex items-start gap-1.5">
	<TwoLineCell
		primary={first && unitTitle(first)}
		secondary={first &&
			(first.name ? `${unitModel(first)} · ${first.serialNumber}` : first.serialNumber)}
		href={first ? resolve("/(app)/equipment/[serial]", { serial: first.serialNumber }) : undefined}
		fallback={m.orders_new_installation()}
	/>
	{#if more}
		<Badge
			variant="secondary"
			class="shrink-0 tabular-nums"
			title={m.orders_more_units({ count: more })}
			aria-label={m.orders_more_units({ count: more })}
		>
			+{formatNumber(more)}
		</Badge>
	{/if}
</div>
