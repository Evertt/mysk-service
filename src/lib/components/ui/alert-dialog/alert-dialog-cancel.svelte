<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	import {
		buttonVariants,
		type ButtonVariant,
		type ButtonSize,
	} from "#lib/components/ui/button/index.ts";
	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		variant = "outline",
		size = "default",
		...restProps
	}: AlertDialogPrimitive.CancelProps & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	} = $props();

	const theme = useTheme();
</script>

<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn(buttonVariants({ variant, size }), "", theme.classes("alert-dialog-cancel"), className)}
	{...restProps}
/>
