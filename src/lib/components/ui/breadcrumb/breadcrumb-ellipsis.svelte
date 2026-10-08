<script lang="ts">
	import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLSpanElement>>> = $props();

	const theme = useTheme();
</script>

<span
	bind:this={ref}
	data-slot="breadcrumb-ellipsis"
	role="presentation"
	aria-hidden="true"
	class={cn(
		"flex size-5 items-center justify-center [&>svg]:size-4",
		theme.classes("breadcrumb-ellipsis"),
		className,
	)}
	{...restProps}
>
	<MoreHorizontalIcon />
	<span class="sr-only">{m.common_more()}</span>
</span>
