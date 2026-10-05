<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		inset?: boolean;
	} = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="dropdown-menu-label"
	data-inset={inset}
	class={cn(
		"px-2 py-1.5 text-xs font-medium text-muted-foreground data-inset:pl-8",
		theme.classes("dropdown-menu-label"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
