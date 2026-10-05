<!--
	@component
	A themed button and badge inside a `ThemeProvider`, for `theme-provider.svelte.spec.ts`.
-->
<script lang="ts">
	import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
	import type { ButtonSize, ButtonVariant } from "#lib/components/ui/button/index.js";

	import type { Mode, ThemeName } from "./index.js";
	import ThemeProvider from "./theme-provider.svelte";

	let {
		name,
		mode = "light",
		variant,
		size,
		badgeVariant,
		class: className,
	}: {
		name: ThemeName;
		mode?: Mode;
		variant?: ButtonVariant;
		size?: ButtonSize;
		badgeVariant?: BadgeVariant;
		/** Passed to the button. */
		class?: string;
	} = $props();
</script>

<ThemeProvider {name} {mode}>
	<Button {variant} {size} class={className}>Save</Button>
	<Badge variant={badgeVariant}>New</Badge>
</ThemeProvider>
