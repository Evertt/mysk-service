<script lang="ts">
	import { Separator as SeparatorPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import type { Slot } from "#lib/themes/types.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		"data-slot": dataSlot = "separator",
		...restProps
	}: SeparatorPrimitive.RootProps = $props();

	const theme = useTheme();
</script>

<SeparatorPrimitive.Root
	bind:ref
	data-slot={dataSlot}
	class={cn(
		"shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
		theme.classes(dataSlot as Slot),
		className,
	)}
	{...restProps}
/>
