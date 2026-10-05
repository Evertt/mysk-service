<!--
	@component
	Applies a theme to everything inside it: its variables through `data-theme` on `<html>`, its
	component classes through context (see `useTheme`).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import { provideTheme } from "./context.js";
	import { type ThemeName, themes, themeStylesheet } from "./index.js";

	let { name, children }: { name: ThemeName; children: Snippet } = $props();

	provideTheme(() => themes[name]);

	// The server renders the attribute (see `hooks.server.ts`); this keeps it in sync on switches.
	$effect(() => {
		document.documentElement.dataset.theme = name;
	});
</script>

<svelte:head>
	<!-- Every theme's variables, built from our own theme files. -->
	{@html `<style>${themeStylesheet}</style>`}
</svelte:head>

{@render children()}
