<!--
	@component
	"The rules: …": a notice at the end of a page's plain half, pointing the developer at the doc
	that holds the rules of what the page shows (`doc` from the project root, `section` the heading
	to land on). Links to the doc on GitHub at the commit the wiki was built from. The link guard
	(`src/tests/unit/wiki/links.spec.ts`) checks that every `doc` written in a page is a file.
-->
<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";

	import Callout from "#lib/components/callout.svelte";

	import { githubUrl, headingSlug } from "./github.ts";

	let {
		doc,
		section,
	}: {
		/** From the project root: `docs/agents/tenancy.md`. */
		doc: string;
		/** The heading in the doc to land on: `Tenancy`. */
		section?: string;
	} = $props();

	const href = $derived(githubUrl(doc, section ? headingSlug(section) : undefined));
</script>

<Callout tone="brand" icon={BookOpenIcon} class="not-prose my-6">
	<p>
		{m.wiki_rules()}
		<a {href} target="_blank" rel="noopener noreferrer" class="font-medium underline">
			{doc}{#if section}, {section}{/if}
		</a>
	</p>
</Callout>
