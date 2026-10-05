<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLLIElement>, HTMLLIElement> = $props();

	const theme = useTheme();
</script>

<li
	bind:this={ref}
	data-slot="sidebar-menu-item"
	data-sidebar="menu-item"
	class={cn("group/menu-item relative", theme.classes("sidebar-menu-item"), className)}
	{...restProps}
>
	{@render children?.()}
</li>
