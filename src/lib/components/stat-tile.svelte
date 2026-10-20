<!--
	@component
	The one way to show a key figure, with its label and an optional coloured icon. Format the
	value before passing it (`formatNumber`, `formatCents`, …). Four layouts:

	- `inline` (the default; Connect, Docks): a small label with the icon, the value below in the
	  icon's colour. `tone` says what the number means (`neutral` for a plain count).
	- `stacked` (the dashboard): the icon top left (an `action` top right), the value, the label,
	  then a line of `detail` and the `trend` against the period before. Only the icon takes the
	  tone; a value too wide for a narrow tile is squeezed to fit.
	- `row` (the customer's card): the icon and the label on the left, the value on the right in the
	  tone's colour (best `brand`).
	- `card` (a unit's page, an engineer's, a dashboard card's figures): a card, the label above the
	  value in the tone's colour, an `action` top right, the `detail` in its footer. `size="large"`
	  for a row of figures on their own, `small` (the default) inside a column or a card. A value too
	  wide for a narrow tile is squeezed to fit.

	`detail` and `trend` show in every layout. The parts have `data-stat-tile`, `data-stat-label`,
	`data-stat-value` and `data-stat-trend` (its direction), for tests.
-->
<script lang="ts" module>
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	/** What a tile's number means, or `brand` for the brand's colour. */
	export type StatTone = BadgeTone | "brand";
</script>

<script lang="ts">
	import MinusIcon from "@lucide/svelte/icons/minus";
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import type { Component, Snippet } from "svelte";

	import { squeeze } from "./squeeze.ts";
	import type { StatTrend } from "./stat-trend.ts";

	let {
		label,
		value,
		icon: Icon,
		tone = "neutral",
		layout = "inline",
		size = "small",
		detail,
		trend,
		action,
		children,
	}: {
		label: string;
		value: string;
		/** A Lucide icon, e.g. `LockIcon`. */
		icon?: Component<{ class?: string }>;
		tone?: StatTone;
		layout?: "inline" | "stacked" | "row" | "card" | "figure";
		/** The value's size in the `card` and `figure` layouts. */
		size?: "large" | "small";
		/** A line under the figure, e.g. "3 without an engineer". */
		detail?: string;
		/** The figure against the period before (see `compare()` in `stat-trend.ts`). */
		trend?: StatTrend;
		/** At the top right, e.g. a link to the records behind the number. */
		action?: Snippet;
		/** In the `card` layout's footer, after the detail: e.g. the figure by kind. */
		children?: Snippet;
	} = $props();

	const tones: Record<StatTone, string> = {
		neutral: "text-foreground",
		brand: "text-primary",
		success: "text-success",
		warning: "text-warning",
		danger: "text-destructive",
		info: "text-info",
	};
	const trendIcons = { up: TrendingUpIcon, down: TrendingDownIcon, flat: MinusIcon };
	const TrendIcon = $derived(trend && trendIcons[trend.direction]);
</script>

{#snippet below()}
	{#if detail}
		<div class="text-xs text-muted-foreground">{detail}</div>
	{/if}
	{#if trend && TrendIcon}
		<div
			class={[
				"flex items-center gap-1 text-[11px] font-medium",
				trend.tone === "neutral" ? "text-muted-foreground" : tones[trend.tone],
			]}
			data-stat-trend={trend.direction}
		>
			<TrendIcon class="size-3.5 shrink-0" aria-hidden="true" />
			{trend.text}
		</div>
	{/if}
{/snippet}

{#if layout === "card"}
	<Card.Root data-stat-tile>
		<Card.Header>
			<Card.Description class="flex items-center gap-2" data-stat-label>
				{#if Icon}
					<Icon class="size-4 shrink-0 {tones[tone]}" />
				{/if}
				{label}
			</Card.Description>
			<!-- Squeezed to fit a narrow tile, rather than overflow it (a theme's big type). -->
			<Card.Title
				class={[
					size === "large" ? "text-3xl" : "text-2xl",
					"min-w-0 whitespace-nowrap tabular-nums",
					tones[tone],
				]}
				data-stat-value
				{@attach squeeze()}>{value}</Card.Title
			>
			{#if action}
				<Card.Action>{@render action()}</Card.Action>
			{/if}
		</Card.Header>
		{#if detail || trend || children}
			<Card.Footer class="flex flex-col items-start gap-1">
				{@render below()}
				{@render children?.()}
			</Card.Footer>
		{/if}
	</Card.Root>
{:else if layout === "figure"}
	<div class="flex min-w-0 flex-col gap-1" data-stat-tile>
		<div class="text-sm text-muted-foreground" data-stat-label>{label}</div>
		<div
			class={[
				"text-2xl font-semibold whitespace-nowrap tabular-nums",
				size === "large" && "@md:text-3xl",
				tones[tone],
			]}
			data-stat-value
			{@attach squeeze()}
		>
			{value}
		</div>
		{#if detail || trend}
			<div class="flex flex-col gap-1">{@render below()}</div>
		{/if}
	</div>
{:else if layout === "stacked"}
	<div
		class="flex min-w-0 flex-col rounded-lg border bg-card p-5 text-card-foreground"
		data-stat-tile
	>
		<div class="flex min-h-5 items-start justify-between gap-2">
			{#if Icon}
				<Icon class="size-5 shrink-0 {tones[tone]}" />
			{/if}
			{#if action}
				<div class="-mt-1 -mr-1 ml-auto">{@render action()}</div>
			{/if}
		</div>
		<!-- Squeezed to fit a narrow tile, rather than overflow it (a theme's big type). -->
		<div
			class="mt-3 min-w-0 text-2xl font-semibold whitespace-nowrap tabular-nums"
			data-stat-value
			{@attach squeeze()}
		>
			{value}
		</div>
		<div class="text-xs text-muted-foreground" data-stat-label>{label}</div>
		{#if detail || trend}
			<div class="mt-auto flex flex-col gap-1 pt-2">{@render below()}</div>
		{/if}
	</div>
{:else if layout === "row"}
	<div
		class="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-4 text-card-foreground"
		data-stat-tile
	>
		<div class="flex min-w-0 items-center gap-3">
			{#if Icon}
				<Icon class="size-5 shrink-0 text-muted-foreground" />
			{/if}
			<div class="flex min-w-0 flex-col gap-0.5">
				<span class="text-sm" data-stat-label>{label}</span>
				{@render below()}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<span class="text-base font-semibold tabular-nums {tones[tone]}" data-stat-value>{value}</span
			>
			{@render action?.()}
		</div>
	</div>
{:else}
	<div class="rounded-lg border bg-card p-4 text-card-foreground" data-stat-tile>
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
				{#if Icon}
					<Icon class="size-4 shrink-0 {tones[tone]}" />
				{/if}
				<span data-stat-label>{label}</span>
			</div>
			{@render action?.()}
		</div>
		<div class="mt-2 text-2xl font-semibold tabular-nums {tones[tone]}" data-stat-value>
			{value}
		</div>
		{#if detail || trend}
			<div class="mt-1 flex flex-col gap-1">{@render below()}</div>
		{/if}
	</div>
{/if}
