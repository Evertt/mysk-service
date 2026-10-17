<!--
	@component
	A KPI tile of the site's page, as the mockup draws it: an icon before the label, the value in the
	tile's colour, its change against the previous period with an arrow (green when it fell, rose
	when it rose: less energy is better) and a line of detail.
-->
<script lang="ts">
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import type { Component } from "svelte";

	import { changeClass, formatChange } from "../display.ts";

	let {
		kpi,
		label,
		value,
		detail,
		change,
		compared,
		icon: Icon,
		tone = "text-foreground",
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
		icon?: Component;
		/** The icon's and the value's colour, a text colour class. */
		tone?: string;
	} = $props();

	const Trend = $derived(
		change !== undefined && change !== null && change < 0 ? TrendingDownIcon : TrendingUpIcon,
	);
</script>

<Card.Root size="sm" data-kpi={kpi}>
	<Card.Header>
		<Card.Description class="flex items-center gap-2 text-xs font-medium">
			{#if Icon}<Icon class={["size-4 shrink-0", tone]} aria-hidden="true" />{/if}
			{label}
		</Card.Description>
		<Card.Title class={["text-xl whitespace-nowrap tabular-nums sm:text-2xl", tone]}
			>{value}</Card.Title
		>
	</Card.Header>
	<Card.Content class="flex flex-col gap-0.5 text-xs">
		{#if change !== undefined}
			<span
				class={["inline-flex items-center gap-1 font-medium tabular-nums", changeClass(change)]}
				data-change
			>
				{#if change !== null}<Trend class="size-3 shrink-0" aria-hidden="true" />{/if}
				{formatChange(change)}
				{#if compared}<span class="font-normal text-muted-foreground">{compared}</span>{/if}
			</span>
		{/if}
		{#if detail}<span class="text-muted-foreground">{detail}</span>{/if}
	</Card.Content>
</Card.Root>
