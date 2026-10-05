<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { Path } from "$app/types";

	import favicon from "#lib/assets/favicon.svg";
	import { locales, localizeHref } from "#lib/paraglide/runtime.js";

	import "./layout.css";
	import type { LayoutProps } from "./$types";
	import DemoLinks from "./demo/DemoLinks.svelte";

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Path)}>{locale}</a>
	{/each}
</div>

<DemoLinks />
