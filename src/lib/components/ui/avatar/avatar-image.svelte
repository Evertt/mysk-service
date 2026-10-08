<script lang="ts">
	import { Avatar as AvatarPrimitive } from "bits-ui";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AvatarPrimitive.ImageProps = $props();

	const theme = useTheme();
</script>

<AvatarPrimitive.Image
	bind:ref
	data-slot="avatar-image"
	class={cn(
		"aspect-square size-full rounded-full object-cover",
		theme.classes("avatar-image"),
		className,
	)}
	{...restProps}
/>
