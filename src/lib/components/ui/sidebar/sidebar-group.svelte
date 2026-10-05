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
	data-slot="sidebar-group"
	data-sidebar="group"
	class={cn("relative flex w-full min-w-0 flex-col p-2", theme.classes("sidebar-group"), className)}
	{...restProps}
>
	{@render children?.()}
</div>
