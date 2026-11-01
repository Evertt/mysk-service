<!--
	@component
	The wiki's search, in its header: a button (and `/`, Ctrl+K or ⌘K) that opens a search box over
	the page. As the visitor types it lists the pages and headings holding every word
	(`searchPages()`, `search.ts`); choosing one opens its page, at the heading if it's one
	(`entryHref()`). It searches the titles and headings in the visitor's language (`searchIndex()`).
-->
<script lang="ts">
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import HashIcon from "@lucide/svelte/icons/hash";
	import SearchIcon from "@lucide/svelte/icons/search";

	import { entryHref, searchIndex, searchPages } from "./search.ts";

	let open = $state(false);
	let query = $state("");

	const index = searchIndex();
	const results = $derived(searchPages(query, index).slice(0, 20));

	/** Whether the key was typed into a field, where `/` is just a slash. */
	const typing = (target: EventTarget | null) =>
		target instanceof HTMLElement &&
		(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

	function onkeydown(event: KeyboardEvent) {
		const shortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
		if (shortcut || (event.key === "/" && !open && !typing(event.target))) {
			event.preventDefault();
			open = !open;
		}
	}

	function chosen() {
		open = false;
		query = "";
	}
</script>

<svelte:window {onkeydown} />

<Button
	variant="outline"
	size="sm"
	class="w-9 justify-start px-0 text-muted-foreground sm:w-56 sm:px-3"
	aria-label={m.wiki_search()}
	onclick={() => (open = true)}
>
	<SearchIcon class="mx-auto sm:mx-0" />
	<span class="hidden sm:inline">{m.wiki_search_placeholder()}</span>
	<kbd
		class="pointer-events-none ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline"
	>
		/
	</kbd>
</Button>

<Command.Dialog
	bind:open
	shouldFilter={false}
	title={m.wiki_search()}
	description={m.wiki_search_description()}
>
	<Command.Input
		bind:value={query}
		placeholder={m.wiki_search_placeholder()}
		aria-label={m.wiki_search()}
	/>
	<Command.List>
		{#if query.trim() && results.length === 0}
			<p class="py-6 text-center text-sm text-muted-foreground">
				{m.wiki_search_none({ query: query.trim() })}
			</p>
		{/if}
		{#each results as entry (entryHref(entry))}
			<Command.LinkItem href={entryHref(entry)} value={entryHref(entry)} onSelect={chosen}>
				{#if entry.heading}
					<HashIcon class="text-muted-foreground" />
					<span class="grid min-w-0">
						<span class="truncate">{entry.heading}</span>
						<span class="truncate text-xs text-muted-foreground">{entry.title}</span>
					</span>
				{:else}
					<FileTextIcon class="text-muted-foreground" />
					<span class="truncate">{entry.title}</span>
				{/if}
			</Command.LinkItem>
		{/each}
	</Command.List>
</Command.Dialog>
