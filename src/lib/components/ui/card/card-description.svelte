<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();

	const theme = useTheme();
</script>

<p
	bind:this={ref}
	data-slot="card-description"
	class={cn("text-sm text-muted-foreground", theme.classes("card-description"), className)}
	{...restProps}
>
	{@render children?.()}
</p>
