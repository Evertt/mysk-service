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
	data-slot="card-title"
	class={cn(
		"text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
		theme.classes("card-title"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
