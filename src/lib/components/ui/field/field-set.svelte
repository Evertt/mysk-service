<script lang="ts">
	import type { HTMLFieldsetAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLFieldsetAttributes> = $props();

	const theme = useTheme();
</script>

<fieldset
	bind:this={ref}
	data-slot="field-set"
	class={cn(
		"flex flex-col gap-6 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
		theme.classes("field-set"),
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</fieldset>
