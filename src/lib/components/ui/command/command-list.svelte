<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.ListProps = $props();

	const theme = useTheme();
</script>

<CommandPrimitive.List
	bind:ref
	data-slot="command-list"
	class={cn(
		"relative no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
		theme.classes("command-list"),
		className,
	)}
	{...restProps}
/>
