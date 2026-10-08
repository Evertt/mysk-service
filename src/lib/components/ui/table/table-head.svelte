<script lang="ts">
	import type { HTMLThAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLThAttributes> = $props();

	const theme = useTheme();
</script>

<th
	bind:this={ref}
	data-slot="table-head"
	class={cn(
		"h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
		theme.classes("table-head"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</th>
