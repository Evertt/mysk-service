<!--
	@component
	A KPI tile of the site's page: its value, a line of detail, and its change against the previous
	period, green when it fell and rose when it rose (less energy is better).
-->
<script lang="ts">
	import { changeClass, formatChange } from "../display.ts";

	let {
		kpi,
		label,
		value,
		detail,
		change,
		compared,
	}: {
		/** What the tile is (`data-kpi`), for tests. */
		kpi: string;
		label: string;
		value: string;
		detail?: string;
		/** In percent, or null without a previous value; none for a tile without a change. */
		change?: number | null;
		/** What the change is against, e.g. "vs yesterday". */
		compared?: string;
	} = $props();
</script>

<Card.Root size="sm" data-kpi={kpi}>
	<Card.Header>
		<Card.Description>{label}</Card.Description>
		<Card.Title class="text-2xl whitespace-nowrap tabular-nums">{value}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-0.5 text-xs">
		{#if change !== undefined}
			<span class={["font-medium tabular-nums", changeClass(change)]} data-change>
				{formatChange(change)}
				{#if compared}<span class="font-normal text-muted-foreground">{compared}</span>{/if}
			</span>
		{/if}
		{#if detail}<span class="text-muted-foreground">{detail}</span>{/if}
	</Card.Content>
</Card.Root>
