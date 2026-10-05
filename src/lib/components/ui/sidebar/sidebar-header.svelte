<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="sidebar-header"
	data-sidebar="header"
	class={cn("flex flex-col gap-2 p-2", theme.classes("sidebar-header"), className)}
	{...restProps}
>
	{@render children?.()}
</div>
