<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {} = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="select-label"
	class={cn("px-2 py-1.5 text-xs text-muted-foreground", theme.classes("select-label"), className)}
	{...restProps}
>
	{@render children?.()}
</div>
