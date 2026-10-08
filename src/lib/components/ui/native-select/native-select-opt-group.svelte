<script lang="ts">
	import type { HTMLOptgroupAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOptgroupAttributes> = $props();

	const theme = useTheme();
</script>

<optgroup
	bind:this={ref}
	data-slot="native-select-optgroup"
	class={cn("bg-[Canvas] text-[CanvasText]", theme.classes("native-select-optgroup"), className)}
	{...restProps}
>
	{@render children?.()}
</optgroup>
