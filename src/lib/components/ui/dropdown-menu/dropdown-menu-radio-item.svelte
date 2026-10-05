<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithoutChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children: childrenProp,
		closeOnSelect = false,
		...restProps
	}: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();

	const theme = useTheme();
</script>

<DropdownMenuPrimitive.RadioItem
	bind:ref
	{closeOnSelect}
	data-slot="dropdown-menu-radio-item"
	class={cn(
		"relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		theme.classes("dropdown-menu-radio-item"),
		className,
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class={cn(
				"pointer-events-none absolute right-2 flex items-center justify-center",
				theme.classes("dropdown-menu-radio-item-indicator"),
			)}
			data-slot="dropdown-menu-radio-item-indicator"
		>
			{#if checked}
				<CheckIcon />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</DropdownMenuPrimitive.RadioItem>
