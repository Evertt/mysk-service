<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

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
	data-slot="field-content"
	class={cn(
		"group/field-content flex flex-1 flex-col gap-1 leading-snug",
		theme.classes("field-content"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
