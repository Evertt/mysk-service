<!--
	@component
	A wiki page: its component, inside the wiki's shell, in the visitor's language. The article is
	marked with the language it's in (`lang`): English where the page has no twin in theirs yet,
	which a note above it says, in their language.
-->
<script lang="ts">
	import LanguagesIcon from "@lucide/svelte/icons/languages";

	import Callout from "#lib/components/callout.svelte";
	import PageStatus from "#wiki/parts/page-status.svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
	const Page = $derived(data.component);
</script>

<svelte:head>
	<title>{data.text.title} · Fieldworks wiki</title>
</svelte:head>

{#if data.untranslated}
	<Callout tone="brand" icon={LanguagesIcon} class="not-prose mb-6" data-testid="wiki-untranslated">
		{m.wiki_not_translated()}
	</Callout>
{/if}
<article lang={data.text.lang}>
	<h1>{data.text.title}</h1>
	<PageStatus status={data.page.status} />
	<Page />
</article>
