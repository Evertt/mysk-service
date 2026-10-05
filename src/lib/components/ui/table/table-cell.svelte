<script lang="ts">
	import type { HTMLTdAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTdAttributes> = $props();

	const theme = useTheme();
</script>

<td
	bind:this={ref}
	data-slot="table-cell"
	class={cn(
		"p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
		theme.classes("table-cell"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</td>
