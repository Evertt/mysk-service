<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.SeparatorProps = $props();

	const theme = useTheme();
</script>

<CommandPrimitive.Separator
	bind:ref
	data-slot="command-separator"
	class={cn("-mx-1 h-px w-auto bg-border", theme.classes("command-separator"), className)}
	{...restProps}
/>
