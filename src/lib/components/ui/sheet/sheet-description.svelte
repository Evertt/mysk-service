<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.DescriptionProps = $props();

	const theme = useTheme();
</script>

<SheetPrimitive.Description
	bind:ref
	data-slot="sheet-description"
	class={cn("text-sm text-muted-foreground", theme.classes("sheet-description"), className)}
	{...restProps}
/>
