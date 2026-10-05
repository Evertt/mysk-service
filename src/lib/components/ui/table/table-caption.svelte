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

<caption
	bind:this={ref}
	data-slot="table-caption"
	class={cn("mt-4 text-sm text-muted-foreground", theme.classes("table-caption"), className)}
	{...restProps}
>
	{@render children?.()}
</caption>
