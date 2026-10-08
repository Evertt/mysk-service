<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="card-action"
	class={cn(
		"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
		theme.classes("card-action"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
