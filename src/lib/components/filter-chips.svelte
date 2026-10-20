<!--
	@component
	A row of rounded chips with counts, one chosen at a time, as the SHLTR mockup filters Apparatuur
	by "SOORT" and Connect by customer: an optional "all" chip first, a chip per option. Each chip has
	its value as `data-chip` ("all" for the first), for tests.

	Button chips call `onchange`: choosing the chosen chip again chooses none (as "all" does), and the
	pressed one has `aria-pressed`. Link chips (an `href` on each, for a choice kept in the URL, so
	back, forward and a reload keep it) go to their page, the current one marked `aria-current`.
	Other attributes go to the row, e.g. `data-sveltekit-replacestate` for its links.
-->
<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	interface Chip {
		label: string;
		/** How many rows it leaves, shown after the label. */
		count?: number;
		/** Makes the chip a link to this page: the choice kept in the URL. */
		href?: string;
	}

	let {
		label,
		showLabel = false,
		options,
		value,
		all,
		onchange,
		class: className,
		...rest
	}: Omit<HTMLAttributes<HTMLDivElement>, "class" | "onchange"> & {
		/** What the chips choose, e.g. "Category": the group's name for screen readers. */
		label: string;
		/** Shows `label` before the chips, small and in capitals, as the mockup's "SOORT". */
		showLabel?: boolean;
		options: (Chip & { value: string })[];
		/** The chosen option's value, or null for none. */
		value: string | null;
		/** The chip that chooses none, e.g. "All 760". */
		all?: Chip;
		/** Called with the chosen value (null for none) by button chips; link chips need none. */
		onchange?: (value: string | null) => void;
		class?: string;
	} = $props();
</script>

{#snippet chip(chipValue: string | null, { label: chipLabel, count, href }: Chip)}
	{@const chosen = value === chipValue}
	{@const look = [
		"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
		chosen
			? "border-primary/40 bg-accent text-accent-foreground"
			: "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
	]}
	{#if href !== undefined}
		<a
			{href}
			aria-current={chosen ? "page" : undefined}
			data-chip={chipValue ?? "all"}
			class={look}
		>
			{@render content(chipLabel, count)}
		</a>
	{:else}
		<button
			type="button"
			aria-pressed={chosen}
			data-chip={chipValue ?? "all"}
			class={look}
			onclick={() => onchange?.(chosen || chipValue === null ? null : chipValue)}
		>
			{@render content(chipLabel, count)}
		</button>
	{/if}
{/snippet}

{#snippet content(chipLabel: string, count: number | undefined)}
	{chipLabel}
	{#if count !== undefined}
		<span class="tabular-nums opacity-70">{formatNumber(count)}</span>
	{/if}
{/snippet}

<div
	{...rest}
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
		{@render chip(null, all)}
	{/if}
	{#each options as option (option.value)}
		{@render chip(option.value, option)}
	{/each}
</div>
