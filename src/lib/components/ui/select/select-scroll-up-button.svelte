<script lang="ts">
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import { Select as SelectPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props();

	const theme = useTheme();
</script>

<SelectPrimitive.ScrollUpButton
	bind:ref
	data-slot="select-scroll-up-button"
	class={cn(
		"z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
		theme.classes("select-scroll-up-button"),
		className,
	)}
	{...restProps}
>
	<ChevronUpIcon />
</SelectPrimitive.ScrollUpButton>
