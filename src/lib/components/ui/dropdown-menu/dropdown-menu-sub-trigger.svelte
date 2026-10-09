<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: DropdownMenuPrimitive.SubTriggerProps & {
		inset?: boolean;
	} = $props();

	const theme = useTheme();
</script>

<DropdownMenuPrimitive.SubTrigger
	bind:ref
	data-slot="dropdown-menu-sub-trigger"
	data-inset={inset}
	class={cn(
		"group/dropdown-menu-sub-trigger flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		theme.classes("dropdown-menu-sub-trigger"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronRightIcon
		class="cn-rtl-flip ml-auto group-has-[.ml-auto]/dropdown-menu-sub-trigger:ml-0"
	/>
</DropdownMenuPrimitive.SubTrigger>
