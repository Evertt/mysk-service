<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();

	const theme = useTheme();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		"border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
		theme.classes("table-row"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
