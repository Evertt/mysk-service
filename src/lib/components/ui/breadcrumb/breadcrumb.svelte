<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import type { WithElementRef } from "#lib/utils.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

	const theme = useTheme();
</script>

<nav
	bind:this={ref}
	data-slot="breadcrumb"
	aria-label={m.common_breadcrumb()}
	class={cn(className, theme.classes("breadcrumb"))}
	{...restProps}
>
	{@render children?.()}
</nav>
