<script lang="ts">
	import type { HTMLTableAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();

	const theme = useTheme();
</script>

<div
	data-slot="table-container"
	class={cn("relative w-full overflow-x-auto", theme.classes("table-container"))}
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
