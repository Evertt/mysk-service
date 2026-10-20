<!--
	@component
	A notice in the page, as the SHLTR mockup's call-outs, tinted in its tone's colour: `brand` (a
	balance, a choice waiting), `success` (done: an order placed), `warning` (stock running low,
	tasks due) or `danger` (refused). An icon (in the tone's colour, or on a tile in the brand's), a
	title, the text (`children`) and, on the right (below it on a phone), `actions`. Other
	attributes (`role`, `data-…`) go on its root.
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
		tone?: "brand" | "success" | "warning" | "danger";
		icon?: Component<{ class?: string }>;
		/** The icon on a tile in the brand's colour, for a callout that leads a page. */
		iconTile?: boolean;
		title?: string;
		children?: Snippet;
		actions?: Snippet;
		class?: string;
	} & Omit<HTMLAttributes<HTMLDivElement>, "class" | "title" | "children"> = $props();

	const tones = {
		brand: { box: "border-primary/30 bg-primary/5 dark:bg-primary/10", icon: "text-primary" },
		success: { box: "border-success/30 bg-success/10", icon: "text-success" },
		warning: { box: "border-warning/30 bg-warning/10", icon: "text-warning" },
		danger: { box: "border-destructive/30 bg-destructive/10", icon: "text-destructive" },
	};
</script>

<div
	class={cn(
		"flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center",
		iconTile && "p-4",
		tones[tone].box,
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
			<Icon class={cn("mt-0.5 size-4 shrink-0", tones[tone].icon)} />
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
