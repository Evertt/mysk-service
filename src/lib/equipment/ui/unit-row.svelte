<!--
	@component
	One unit in a list of units, in every shell: what it's called, what its title doesn't say on a
	line below it (`unitLine()`, with the page's `extras`), and its state. With `href` the row is a
	link to the unit's page in the shell (the portals'); the office links its title with
	`EquipmentLink` instead, for its hover card (`title`). `number` is its place in an order's units;
	`children` are lines below, e.g. its warranty.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import type { EquipmentStatus } from "#lib/models.ts";

	import { equipmentStatusDisplay, unitLine, unitTitle } from "../display.ts";

	let {
		unit,
		href,
		extras = {},
		number,
		title,
		children,
	}: {
		unit: {
			serialNumber: string;
			name: string | null;
			manufacturer: string;
			model: string;
			status: EquipmentStatus;
		};
		/** The unit's page in this shell: the row links to it. */
		href?: string;
		/** What the line below the title adds, those it has (`unitLine()`). */
		extras?: Parameters<typeof unitLine>[1];
		/** Its place in an order's units, from 1. */
		number?: number;
		/** The title instead of the plain one, e.g. the office's `EquipmentLink`. */
		title?: Snippet;
		/** Lines below, e.g. its warranty. */
		children?: Snippet;
	} = $props();
</script>

<svelte:element
	this={href ? "a" : "div"}
	{href}
	data-unit={unit.serialNumber}
	class={[
		"flex items-center gap-3 py-3 text-sm",
		href && "-mx-2 rounded-md px-2 transition-colors hover:bg-accent",
	]}
>
	{#if number !== undefined}
		<span class="w-6 shrink-0 self-start text-right text-muted-foreground tabular-nums">
			{formatNumber(number)}
		</span>
	{/if}
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="truncate font-medium">
			{#if title}
				{@render title()}
			{:else}
				{unitTitle(unit)}
			{/if}
		</span>
		<span class="truncate text-xs text-muted-foreground">{unitLine(unit, extras)}</span>
		{@render children?.()}
	</div>
	<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
</svelte:element>
