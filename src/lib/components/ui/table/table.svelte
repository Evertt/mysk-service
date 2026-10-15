<script lang="ts">
	import type { HTMLTableAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();

	const theme = useTheme();
</script>

<!-- Scrolls sideways only: as tall as its table, which can be a fraction of a pixel taller than its
     rounded height, and would otherwise scroll by that pixel, catching the page's scrolling. -->
<div
	data-slot="table-container"
	class={cn("relative w-full overflow-x-auto overflow-y-hidden", theme.classes("table-container"))}
>
	<table
		bind:this={ref}
		data-slot="table"
		class={cn("w-full caption-bottom text-sm", theme.classes("table"), className)}
		{...restProps}
	>
		{@render children?.()}
	</table>
</div>
