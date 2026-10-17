<!--
	@component
	A row of rounded chips with counts, one chosen at a time, as the SHLTR mockup filters Apparatuur
	by "SOORT" and Connect by customer: an optional "all" chip first, a chip per option. Choosing the
	chosen chip again chooses none (as "all" does). Pressed chips have `aria-pressed`, and each chip
	its value as `data-chip` ("all" for the first), for tests.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	interface Chip {
		value: string;
		label: string;
		/** How many rows it leaves, shown after the label. */
		count?: number;
	}

	let {
		label,
		showLabel = false,
		options,
		value,
		all,
		onchange,
		class: className,
	}: {
		/** What the chips choose, e.g. "Category": the group's name for screen readers. */
		label: string;
		/** Shows `label` before the chips, small and in capitals, as the mockup's "SOORT". */
		showLabel?: boolean;
		options: Chip[];
		/** The chosen option's value, or null for none. */
		value: string | null;
		/** The chip that chooses none, e.g. "All 760". */
		all?: { label: string; count?: number };
		onchange: (value: string | null) => void;
		class?: string;
	} = $props();
</script>

{#snippet chip(chipValue: string | null, chipLabel: string, count: number | undefined)}
	{@const pressed = value === chipValue}
	<button
		type="button"
		aria-pressed={pressed}
		data-chip={chipValue ?? "all"}
		class={[
			"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
			pressed
				? "border-primary/40 bg-accent text-accent-foreground"
				: "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
		]}
		onclick={() => onchange(pressed || chipValue === null ? null : chipValue)}
	>
		{chipLabel}
		{#if count !== undefined}
			<span class="tabular-nums opacity-70">{formatNumber(count)}</span>
		{/if}
	</button>
{/snippet}

<div
	role="group"
	aria-label={label}
	class={cn("flex flex-wrap items-center gap-2", className)}
	data-filter-chips
>
	{#if showLabel}
		<span class="mr-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
			{label}
		</span>
	{/if}
	{#if all}
		{@render chip(null, all.label, all.count)}
	{/if}
	{#each options as option (option.value)}
		{@render chip(option.value, option.label, option.count)}
	{/each}
</div>
