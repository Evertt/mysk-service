<!--
	@component
	Applies a theme to everything inside it: its variables through `data-theme` on `<html>`, its
	component classes through context (see `useTheme`), and dark mode through the `dark` class.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { provideTheme } from "./context.js";
	import { type Mode, type ThemeName, themes, themeStylesheet } from "./index.js";

	let { name, mode, children }: { name: ThemeName; mode: Mode; children: Snippet } = $props();

	const systemPrefersDark = new MediaQuery("(prefers-color-scheme: dark)");
	const dark = $derived(mode === "dark" || (mode === "system" && systemPrefersDark.current));

	provideTheme(
		() => themes[name],
		() => dark,
	);

	// The server renders these (see `hooks.server.ts` and `app.html`); this keeps them in sync on
	// switches and when the system preference changes.
	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = name;
		root.dataset.mode = mode;
		root.classList.toggle("dark", dark);
	});
</script>

<svelte:head>
	<!-- Every theme's variables, built from our own theme files. -->
	{@html `<style>${themeStylesheet}</style>`}
</svelte:head>

{@render children()}
