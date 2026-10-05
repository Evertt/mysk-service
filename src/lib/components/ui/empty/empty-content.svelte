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
	data-slot="empty-content"
	class={cn(
		"flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
		theme.classes("empty-content"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
