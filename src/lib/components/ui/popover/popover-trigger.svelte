<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PopoverPrimitive.TriggerProps = $props();

	const theme = useTheme();
</script>

<PopoverPrimitive.Trigger
	bind:ref
	data-slot="popover-trigger"
	class={cn(className, theme.classes("popover-trigger"))}
	{...restProps}
/>
