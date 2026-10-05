<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SelectPrimitive.GroupProps = $props();

	const theme = useTheme();
</script>

<SelectPrimitive.Group
	bind:ref
	data-slot="select-group"
	class={cn("scroll-my-1 p-1", theme.classes("select-group"), className)}
	{...restProps}
/>
