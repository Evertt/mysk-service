<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { Select as SelectPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps> = $props();

	const theme = useTheme();
</script>

<SelectPrimitive.ScrollDownButton
	bind:ref
	data-slot="select-scroll-down-button"
	class={cn(
		"z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
		theme.classes("select-scroll-down-button"),
		className,
	)}
	{...restProps}
>
	<ChevronDownIcon />
</SelectPrimitive.ScrollDownButton>
