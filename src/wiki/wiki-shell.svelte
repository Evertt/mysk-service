<!--
	@component
	The wiki's shell (`/wiki`, docs/plans/wiki.md): a sidebar of its sections and pages (`wikiNav()`),
	a header with the theme and mode, and the page in a readable column of prose. Public and
	tenantless, so it asks the app for nothing: no user, no organization. English only.
-->
<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import type { Snippet } from "svelte";

	import AppearanceSwitchers from "#routes/appearance-switchers.svelte";
	import BrandMark from "#routes/brand-mark.svelte";
	import NavSidebar from "#routes/nav-sidebar.svelte";

	import { wikiNav } from "./pages.ts";

	let { children }: { children: Snippet } = $props();

	const groups = wikiNav();
</script>

<Sidebar.Provider>
	<NavSidebar {groups} label="Wiki">
		{#snippet header()}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Fieldworks wiki">
						{#snippet child({ props })}
							<a {...props} href="/wiki">
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
		<header
			class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur"
		>
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-1 h-4! self-center" />
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<AppearanceSwitchers />
			</div>
		</header>
		<main class="mx-auto w-full max-w-3xl min-w-0 flex-1 p-4 pb-16 md:p-8">
			<article class="prose max-w-none dark:prose-invert">
				{@render children()}
			</article>
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
