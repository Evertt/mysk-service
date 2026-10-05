<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLLIElement>> = $props();

	const theme = useTheme();
</script>

<li
	bind:this={ref}
	data-slot="sidebar-menu-sub-item"
	data-sidebar="menu-sub-item"
	class={cn("group/menu-sub-item relative", theme.classes("sidebar-menu-sub-item"), className)}
	{...restProps}
>
	{@render children?.()}
</li>
