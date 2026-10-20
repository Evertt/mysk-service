<!--
	@component
	A page's title and description, with optional breadcrumbs above (`breadcrumbs`, or anything else
	in `children`) and actions on the right (`actions`). It also titles the browser tab: the title
	and the nearest page in the trail that the title doesn't name already ("ORD-1042 · Orders",
	"Edit Acme · Customers"), or `documentTitle`. So a page with a header writes no `<title>` of its
	own.
-->
<script lang="ts" module>
	/** A page in the trail; the last is the current one, so it has no `href`. */
	export interface Crumb {
		label: string;
		href?: string;
	}

	/** The browser tab's title of a page titled `title` in `breadcrumbs`' trail. */
	export const headTitle = (title: string, breadcrumbs: Crumb[] = []) => {
		const context = breadcrumbs.findLast(({ label, href }) => href && !title.includes(label));
		return context ? `${title} · ${context.label}` : title;
	};
</script>

<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		breadcrumbs,
		documentTitle,
		children,
		badges,
		actions,
	}: {
		title: string;
		description?: string;
		/** The trail above the title; the last item is the current page, so it has no `href`. */
		breadcrumbs?: Crumb[];
		/** The browser tab's title, if not the title and the trail's nearest page. */
		documentTitle?: string;
		/** Rendered above the title, below the breadcrumbs. */
		children?: Snippet;
		/** Rendered next to the title, e.g. status badges. */
		badges?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{documentTitle ?? headTitle(title, breadcrumbs)}</title>
</svelte:head>

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
