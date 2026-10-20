<!--
	@component
	A dark panel of figures, as the SHLTR mockup shows its Wallet beside the bonus: an icon tile, a
	small label above the title, lines of a label and a value (one `strong`, between rules, its value
	large in the brand's colour), and anything under them (`children`: a button, a list, a note).
	Dark in a light theme (the theme's foreground as its background); in a dark one, the page's own
	colour, outlined. Other attributes (`data-…`) go on its root, `attributes` on a line's value.
-->
<script lang="ts" module>
	/** A line of the panel. */
	export interface DarkPanelLine {
		label: string;
		value: string;
		/** The line that matters, e.g. what's available now. */
		strong?: boolean;
		/** On the value, e.g. `{ "data-wallet-available": "" }` for tests. */
		attributes?: Record<string, string>;
	}
</script>

<script lang="ts">
	import type { Component, Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { cn } from "#lib/utils.ts";

	let {
		title,
		eyebrow,
		icon: Icon,
		lines,
		children,
		class: className,
		...rest
	}: {
		title: string;
		/** The small label above the title, e.g. "Bonus year 2026". */
		eyebrow?: string;
		icon?: Component<{ class?: string }>;
		lines: DarkPanelLine[];
		/** Under the lines. Muted text reads well as `opacity-70`. */
		children?: Snippet;
		class?: string;
	} & Omit<HTMLAttributes<HTMLElement>, "class" | "title" | "children"> = $props();
</script>

<section
	aria-label={title}
	class={cn(
		"flex min-w-0 flex-col gap-6 rounded-lg bg-foreground p-5 text-background sm:p-6 dark:bg-background dark:text-foreground dark:ring-1 dark:ring-border",
		className,
	)}
	data-dark-panel
	{...rest}
>
	<div class="flex items-center gap-3">
		{#if Icon}
			<div
				class="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
			>
				<Icon class="size-5" />
			</div>
		{/if}
		<div class="min-w-0">
			{#if eyebrow}
				<p class="text-xs tracking-wide uppercase opacity-60">{eyebrow}</p>
			{/if}
			<h2 class="text-lg font-semibold">{title}</h2>
		</div>
	</div>
	<dl class="flex flex-col gap-3 text-sm">
		{#each lines as line (line.label)}
			<div
				class={[
					"flex items-baseline justify-between gap-4",
					line.strong && "border-y border-current/20 py-4",
				]}
			>
				<dt class={line.strong ? "font-medium" : "opacity-65"}>{line.label}</dt>
				<dd
					class={[
						"text-right tabular-nums",
						line.strong
							? "text-xl font-semibold text-[color-mix(in_oklch,var(--primary),white_40%)] dark:text-primary"
							: "font-medium",
					]}
					{...line.attributes}
				>
					{line.value}
				</dd>
			</div>
		{/each}
	</dl>
	{@render children?.()}
</section>
