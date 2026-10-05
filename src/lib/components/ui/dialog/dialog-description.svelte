<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DialogPrimitive.DescriptionProps = $props();

	const theme = useTheme();
</script>

<DialogPrimitive.Description
	bind:ref
	data-slot="dialog-description"
	class={cn(
		"text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
		theme.classes("dialog-description"),
		className,
	)}
	{...restProps}
/>
