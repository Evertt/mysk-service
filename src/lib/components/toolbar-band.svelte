<!--
	@component
	A page's title as a solid band in the brand's colour, as the SHLTR mockup opens Planning and
	Apparatuur: an icon, the title (the page's heading), a pill with a count, a line under it, and
	the page's controls on the right (below it on a phone). `children` is a strip under the band,
	e.g. filter chips. Controls on the band read best as `bandButton` (with `variant="ghost"`) and
	`SegmentedNav`'s `band` variant; they take the band's text colour, so it works in every theme,
	light and dark.
-->
<script lang="ts" module>
	/**
	 * A `Button`'s classes on the band (`variant="ghost"`): translucent in the band's text colour, as
	 * the mockup's white-on-teal buttons.
	 */
	export const bandButton =
		"border-current/30 bg-current/10 text-current shadow-none hover:bg-current/20 hover:text-current aria-expanded:bg-current/20 aria-expanded:text-current dark:hover:bg-current/20 focus-visible:border-current focus-visible:ring-current/40";
</script>

<script lang="ts">
	import type { Component, Snippet } from "svelte";

	import { cn } from "#lib/utils.ts";

	let {
		title,
		icon: Icon,
		count,
		description,
		actions,
		children,
		class: className,
	}: {
		title: string;
		/** A Lucide icon before the title. */
		icon?: Component<{ class?: string }>;
		/** In a pill beside the title, formatted, e.g. "42 units". */
		count?: string;
		description?: string;
		/** On the right of the title (below it on a phone): the page's controls. */
		actions?: Snippet;
		/** A strip under the band, in the card's colour, e.g. filter chips. */
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<section class={cn("shrink-0 overflow-hidden rounded-lg border", className)} data-toolbar-band>
	<header
		class="flex flex-col gap-3 bg-primary px-4 py-4 text-primary-foreground sm:px-6 md:flex-row md:items-center md:justify-between dark:bg-[color-mix(in_oklch,var(--primary),black_50%)] dark:text-white"
	>
		<div class="flex min-w-0 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				{#if Icon}
					<Icon class="size-6 shrink-0" />
				{/if}
				<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
				{#if count}
					<span
						class="rounded-full bg-current/15 px-2.5 py-0.5 text-xs font-medium tabular-nums"
						data-band-count>{count}</span
					>
				{/if}
			</div>
			{#if description}
				<p class="text-sm opacity-85">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2 print:hidden">{@render actions()}</div>
		{/if}
	</header>
	{#if children}
		<div class="border-t bg-card px-4 py-3 text-card-foreground sm:px-6">{@render children()}</div>
	{/if}
</section>
