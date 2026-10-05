<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="skeleton"
	class={cn("animate-pulse rounded-md bg-muted", theme.classes("skeleton"), className)}
	{...restProps}
></div>
