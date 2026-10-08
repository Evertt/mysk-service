<script lang="ts">
	import type { HTMLOlAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOlAttributes> = $props();

	const theme = useTheme();
</script>

<ol
	bind:this={ref}
	data-slot="breadcrumb-list"
	class={cn(
		"flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground sm:gap-2.5",
		theme.classes("breadcrumb-list"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</ol>
