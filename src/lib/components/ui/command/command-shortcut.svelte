<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();

	const theme = useTheme();
</script>

<span
	bind:this={ref}
	data-slot="command-shortcut"
	class={cn(
		"ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
		theme.classes("command-shortcut"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</span>
