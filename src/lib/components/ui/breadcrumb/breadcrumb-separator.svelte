<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { HTMLLiAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.js";
	import { cn, type WithElementRef } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLLiAttributes> = $props();

	const theme = useTheme();
</script>

<li
	bind:this={ref}
	data-slot="breadcrumb-separator"
	role="presentation"
	aria-hidden="true"
	class={cn("[&>svg]:size-3.5", theme.classes("breadcrumb-separator"), className)}
	{...restProps}
>
	{#if children}
		{@render children?.()}
	{:else}
		<ChevronRightIcon class="cn-rtl-flip" />
	{/if}
</li>
