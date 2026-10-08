<!--
	@component
	A page's title and description, with optional breadcrumbs above (`breadcrumbs`, or anything else
	in `children`) and actions on the right (`actions`).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		breadcrumbs,
		children,
		badges,
		actions,
	}: {
		title: string;
		description?: string;
		/** The trail above the title; the last item is the current page, so it has no `href`. */
		breadcrumbs?: { label: string; href?: string }[];
		/** Rendered above the title, below the breadcrumbs. */
		children?: Snippet;
		/** Rendered next to the title, e.g. status badges. */
		badges?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-col gap-4">
	{#if breadcrumbs}
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each breadcrumbs as { label, href }, index (index)}
					{#if index > 0}
						<Breadcrumb.Separator />
					{/if}
					<Breadcrumb.Item>
						{#if href}
							<Breadcrumb.Link {href}>{label}</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page>{label}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	{/if}
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
