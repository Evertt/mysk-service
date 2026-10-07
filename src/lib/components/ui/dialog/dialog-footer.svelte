<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import type { HTMLAttributes } from "svelte/elements";

	import { Button } from "#lib/components/ui/button/index.js";
	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		showCloseButton?: boolean;
	} = $props();

	const theme = useTheme();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		"flex flex-col-reverse gap-2 gap-2 sm:flex-row sm:justify-end",
		theme.classes("dialog-footer"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<DialogPrimitive.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>{m.common_close()}</Button>
			{/snippet}
		</DialogPrimitive.Close>
	{/if}
</div>
