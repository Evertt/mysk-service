<!--
	@component
	A segmented control of links, e.g. a schedule's Month / Week / Day: each a page of its own, the
	current one marked (`aria-current`). `band` is its look on a `ToolbarBand`: translucent in the
	band's text colour, the current segment solid, as the mockup's white-on-teal switch. Other
	attributes go to the `nav`, e.g. `data-sveltekit-reset="false"` for its links.
-->
<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn } from "#lib/utils.ts";

	let {
		label,
		items,
		variant = "default",
		class: className,
		...rest
	}: Omit<HTMLAttributes<HTMLElement>, "class"> & {
		/** What the links switch between, for screen readers. */
		label: string;
		items: { label: string; href: string; current: boolean }[];
		variant?: "default" | "band";
		class?: string;
	} = $props();
</script>

<nav
	{...rest}
	aria-label={label}
	class={cn(
		"inline-flex rounded-md border p-0.5",
		variant === "band" ? "border-current/30 bg-current/10" : "bg-background shadow-xs",
		className,
	)}
	data-segmented-nav
>
	{#each items as item (item.href)}
		<a
			href={item.href}
			aria-current={item.current ? "page" : undefined}
			class={cn(
				"rounded-sm px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2",
				variant === "band"
					? item.current
						? "bg-primary-foreground text-primary shadow-xs focus-visible:ring-current/50 dark:bg-white dark:text-[color-mix(in_oklch,var(--primary),black_50%)]"
						: "hover:bg-current/15 focus-visible:ring-current/50"
					: item.current
						? "bg-primary text-primary-foreground focus-visible:ring-ring/50"
						: "text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50",
			)}
		>
			{item.label}
		</a>
	{/each}
</nav>
