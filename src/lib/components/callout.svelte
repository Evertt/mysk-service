<!--
	@component
	A notice in the page, as the SHLTR mockup's call-outs: `brand` (tinted in the brand's colour: a
	balance, a choice waiting) or `warning` (amber: stock running low, tasks due). An icon (plain, or
	on a tile in the brand's colour), a title, the text (`children`) and, on the right (below it on
	a phone), `actions`. Other attributes (`role`, `data-…`) go on its root.
-->
<script lang="ts">
	import type { Component, Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { cn } from "#lib/utils.ts";

	let {
		tone = "brand",
		icon: Icon,
		iconTile = false,
		title,
		children,
		actions,
		class: className,
		...rest
	}: {
		tone?: "brand" | "warning";
		icon?: Component<{ class?: string }>;
		/** The icon on a tile in the brand's colour, for a callout that leads a page. */
		iconTile?: boolean;
		title?: string;
		children?: Snippet;
		actions?: Snippet;
		class?: string;
	} & Omit<HTMLAttributes<HTMLDivElement>, "class" | "title" | "children"> = $props();

	const tones = {
		brand: "border-primary/30 bg-primary/5 text-foreground dark:bg-primary/10",
		warning:
			"border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
	};
</script>

<div
	class={cn(
		"flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center",
		iconTile && "p-4",
		tones[tone],
		className,
	)}
	data-callout={tone}
	{...rest}
>
	<div class={["flex min-w-0 flex-1 gap-3", iconTile ? "items-center" : "items-start"]}>
		{#if Icon && iconTile}
			<div
				class="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
			>
				<Icon class="size-5" />
			</div>
		{:else if Icon}
			<Icon class={cn("mt-0.5 size-4 shrink-0", tone === "brand" && "text-primary")} />
		{/if}
		<div class="flex min-w-0 flex-col gap-0.5">
			{#if title}
				<p class="font-medium">{title}</p>
			{/if}
			{@render children?.()}
		</div>
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-3">{@render actions()}</div>
	{/if}
</div>
