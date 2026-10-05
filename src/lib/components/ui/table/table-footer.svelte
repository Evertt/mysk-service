<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();

	const theme = useTheme();
</script>

<tfoot
	bind:this={ref}
	data-slot="table-footer"
	class={cn(
		"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
		theme.classes("table-footer"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</tfoot>
