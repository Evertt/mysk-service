<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.EmptyProps = $props();

	const theme = useTheme();
</script>

<CommandPrimitive.Empty
	bind:ref
	data-slot="command-empty"
	class={cn("py-6 text-center text-sm", theme.classes("command-empty"), className)}
	{...restProps}
/>
