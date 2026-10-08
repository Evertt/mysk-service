<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import type { WithElementRef } from "#lib/utils.ts";
	import { cn } from "#lib/utils.ts";

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
