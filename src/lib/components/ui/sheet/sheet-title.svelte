<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.TitleProps = $props();

	const theme = useTheme();
</script>

<SheetPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={cn("font-medium text-foreground", theme.classes("sheet-title"), className)}
	{...restProps}
/>
