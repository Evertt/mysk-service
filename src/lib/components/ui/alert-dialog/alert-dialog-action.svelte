<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	import {
		buttonVariants,
		type ButtonVariant,
		type ButtonSize,
	} from "#lib/components/ui/button/index.js";
	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		size = "default",
		...restProps
	}: AlertDialogPrimitive.ActionProps & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	} = $props();

	const theme = useTheme();
</script>

<AlertDialogPrimitive.Action
	bind:ref
	data-slot="alert-dialog-action"
	class={cn(buttonVariants({ variant, size }), "", theme.classes("alert-dialog-action"), className)}
	{...restProps}
/>
