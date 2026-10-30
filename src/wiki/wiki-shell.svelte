<!--
	@component
	The wiki's shell (`/wiki`, docs/plans/wiki.md): a sidebar of its sections and pages (`wikiNav()`),
	a header with the search (`search.svelte`), the way into the app and the language, theme and
	mode, and the page in a readable column of prose, coloured by the theme. Public and tenantless,
	so it asks the app for nothing: no user, no organization.

	English only, and marked so (`lang="en"`): the app's own language is the visitor's (`<html
	lang>`, Dutch for most), which a screen reader would read the pages in. The chrome the shell
	shares with the app (the sidebar's button, the switchers) stays in the app's language.
-->
<script lang="ts">
	import AppWindowIcon from "@lucide/svelte/icons/app-window";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import type { Snippet } from "svelte";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";
	import AppearanceSwitchers from "#routes/appearance-switchers.svelte";
	import BrandMark from "#routes/brand-mark.svelte";
	import NavSidebar from "#routes/nav-sidebar.svelte";

	import { wikiNav } from "./pages.ts";
	import Search from "./search.svelte";

	let { children }: { children: Snippet } = $props();

	const groups = wikiNav();
	const theme = useTheme();
</script>

<Sidebar.Provider>
	<NavSidebar {groups} label="Wiki" lang="en">
		{#snippet header()}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Fieldworks wiki">
						{#snippet child({ props })}
							<a {...props} href="/wiki" lang="en">
								<BrandMark icon={BookOpenIcon} sidebar />
								<span class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-medium">Fieldworks</span>
									<span class="truncate text-xs text-sidebar-foreground/70">Wiki</span>
								</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{/snippet}
	</NavSidebar>
	<!-- min-w-0 lets wide widgets scroll inside the page instead of widening it. -->
	<Sidebar.Inset class="min-w-0">
		<!-- The office's header slot, so a theme styles both alike (`app-header.svelte`). -->
		<header
			data-slot="app-header"
			class={cn(
				"sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur",
				theme.classes("app-header"),
			)}
		>
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-1 h-4! self-center" />
			<Search />
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<!-- The app's home, loaded in full: the guard, which sees only full page loads, sends a
					visitor who isn't signed in to the login page, and everyone else to their shell's home. -->
				<Button
					href="/"
					data-sveltekit-reload
					variant="ghost"
					size="sm"
					lang="en"
					aria-label="Open the app"
				>
					<AppWindowIcon />
					<span class="hidden sm:inline">Open the app</span>
				</Button>
				<AppearanceSwitchers />
			</div>
		</header>
		<main lang="en" class="mx-auto w-full max-w-3xl min-w-0 flex-1 p-4 pb-16 md:p-8">
			<!--
				The typography plugin's colours are the theme's (see the style below), in light and dark.
				Inline code without its backticks, on a quiet tint instead; a long path in it breaks rather
				than widen the page on a phone. A heading the search links to (`#id`) clears the sticky
				header.
			-->
			<article
				class="wiki-prose prose max-w-none prose-headings:scroll-mt-20 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:wrap-anywhere prose-code:before:content-none prose-code:after:content-none [&_pre_code]:bg-transparent [&_pre_code]:p-0"
			>
				{@render children()}
			</article>
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

<style>
	/* The typography plugin's colours, as the theme's tokens: they follow the theme and its mode. */
	.wiki-prose {
		--tw-prose-body: var(--foreground);
		--tw-prose-headings: var(--foreground);
		--tw-prose-lead: var(--muted-foreground);
		--tw-prose-links: var(--primary);
		--tw-prose-bold: var(--foreground);
		--tw-prose-counters: var(--muted-foreground);
		--tw-prose-bullets: var(--muted-foreground);
		--tw-prose-hr: var(--border);
		--tw-prose-quotes: var(--foreground);
		--tw-prose-quote-borders: var(--border);
		--tw-prose-captions: var(--muted-foreground);
		--tw-prose-kbd: var(--foreground);
		--tw-prose-kbd-shadows: color-mix(in oklab, var(--foreground) 10%, transparent);
		--tw-prose-code: var(--foreground);
		--tw-prose-pre-code: var(--foreground);
		--tw-prose-pre-bg: var(--muted);
		--tw-prose-th-borders: var(--border);
		--tw-prose-td-borders: var(--border);
	}
</style>
