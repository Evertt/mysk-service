<!--
	@component
	A page's title as a banner in the brand's colour, as the SHLTR mockup opens its module pages
	(Docks, Energie, Connect): a small label above (`eyebrow`, with `badges` beside it, e.g. a live
	dot or the simulation's state), the title, an intro, and actions on the right. Its colours are
	the theme's primary and its foreground, so it works in every theme, light and dark.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		eyebrow,
		badges,
		actions,
		children,
	}: {
		title: string;
		description?: string;
		/** The small label above the title, e.g. "Salvo systeem". */
		eyebrow?: string;
		/** Beside the label: badges on the banner (light text on its colour). */
		badges?: Snippet;
		/** On the right, e.g. a settings button (`variant="secondary"` reads well on it). */
		actions?: Snippet;
		/** Below the intro. */
		children?: Snippet;
	} = $props();
</script>

<header
	class="rounded-lg border border-primary/30 bg-linear-to-r from-[color-mix(in_oklch,var(--primary),black_12%)] to-primary px-5 py-5 text-primary-foreground sm:px-6 sm:py-6"
	data-page-banner
>
	{#if eyebrow || badges}
		<div
			class="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wider uppercase opacity-90"
		>
			{#if eyebrow}
				<span class="rounded bg-primary-foreground/15 px-2 py-0.5">{eyebrow}</span>
			{/if}
			{@render badges?.()}
		</div>
	{/if}
	<div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex min-w-0 flex-col gap-2">
			<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
			{#if description}
				<p class="max-w-3xl text-sm opacity-90">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	{@render children?.()}
</header>
