<!--
	@component
	A page's title and description, with optional breadcrumbs above (`children`) and actions on the
	right (`actions`).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		children,
		badges,
		actions,
	}: {
		title: string;
		description?: string;
		/** Rendered above the title, e.g. breadcrumbs. */
		children?: Snippet;
		/** Rendered next to the title, e.g. status badges. */
		badges?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-col gap-4">
	{@render children?.()}
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
				{@render badges?.()}
			</div>
			{#if description}
				<p class="text-muted-foreground">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
</div>
