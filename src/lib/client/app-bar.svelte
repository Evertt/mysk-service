<!--
	@component
	The customer portal's app bar, at the top of each of its pages and its modules' pages, as a phone
	app's: in the primary colour, the page's title (its `<h1>`) with what it's about under it (a
	unit, an order's number), a back arrow on a page below a tab's, the page's own buttons, and the
	shell's bell (`provideAppBarActions()`). It stays at the top while the page scrolls, and runs
	under a phone's status bar (`--safe-area-top`, `phone-frame.svelte`). It also titles the tab.

	A page places it first in its markup; the shell's column gives the room around it.
-->
<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import type { Snippet } from "svelte";

	import { appBarActions } from "./app-bar.ts";

	let {
		title,
		subtitle,
		back,
		actions,
	}: {
		title: string;
		/** What the page is about, under its title: e.g. the unit a breakdown is reported of. */
		subtitle?: string | null;
		/** The page above this one, where the back arrow goes. None on a tab's own page. */
		back?: { href: string; label: string };
		/** The page's own buttons, before the bell. */
		actions?: Snippet;
	} = $props();

	const shell = appBarActions();
</script>

<svelte:head>
	<title>{title} · {m.client_title()}</title>
</svelte:head>

<header
	class="app-bar sticky top-0 z-20 -mx-4 bg-primary pt-(--safe-area-top) text-primary-foreground print:hidden"
	data-app-bar
>
	<div class="flex min-h-14 items-center gap-1 px-2">
		{#if back}
			<Button
				variant="ghost"
				size="icon"
				class="rounded-full"
				href={back.href}
				aria-label={back.label}
				data-app-bar-back
			>
				<ChevronLeftIcon class="size-6" />
			</Button>
		{:else}
			<span class="w-2 shrink-0"></span>
		{/if}
		<div class="flex min-w-0 flex-1 flex-col py-2">
			<h1 class="truncate text-[1.0625rem] leading-snug font-semibold">{title}</h1>
			{#if subtitle}
				<p class="truncate text-[0.8125rem] leading-snug opacity-85" data-app-bar-subtitle>
					{subtitle}
				</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center">
			{@render actions?.()}
			{@render shell?.()}
		</div>
	</div>
</header>

<style>
	/* Its buttons in the bar's colours. */
	.app-bar :global([data-slot="button"]) {
		color: inherit;
		border-radius: 9999px;
	}
	.app-bar :global([data-slot="button"]:is(:hover, [aria-expanded="true"])) {
		background-color: color-mix(in oklab, var(--primary-foreground) 16%, transparent);
		color: inherit;
	}
	.app-bar :global([data-notification-dot]) {
		--tw-ring-color: var(--primary);
	}
</style>
