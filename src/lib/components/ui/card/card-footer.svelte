<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="card-footer"
	class={cn(
		"flex items-center rounded-b-xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
		theme.classes("card-footer"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
