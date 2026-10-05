<script lang="ts">
	import type { HTMLOptionAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOptionAttributes> = $props();

	const theme = useTheme();
</script>

<option
	bind:this={ref}
	data-slot="native-select-option"
	class={cn("bg-[Canvas] text-[CanvasText]", theme.classes("native-select-option"), className)}
	{...restProps}
>
	{@render children?.()}
</option>
