<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DialogPrimitive.TitleProps = $props();

	const theme = useTheme();
</script>

<DialogPrimitive.Title
	bind:ref
	data-slot="dialog-title"
	class={cn("leading-none font-medium", theme.classes("dialog-title"), className)}
	{...restProps}
/>
