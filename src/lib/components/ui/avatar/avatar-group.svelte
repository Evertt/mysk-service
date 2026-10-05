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
	data-slot="avatar-group"
	class={cn(
		"group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
		theme.classes("avatar-group"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
