<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AlertDialogPrimitive.TitleProps = $props();

	const theme = useTheme();
</script>

<AlertDialogPrimitive.Title
	bind:ref
	data-slot="alert-dialog-title"
	class={cn(
		"text-lg font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
		theme.classes("alert-dialog-title"),
		className,
	)}
	{...restProps}
/>
