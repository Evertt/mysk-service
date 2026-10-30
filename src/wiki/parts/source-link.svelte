<!--
	@component
	A link from a wiki page to a source file on GitHub, at the commit the wiki was built from, so the
	line is still the line: `path` from the project root, and `line` to land on it. Opens in a new
	tab. The label (`children`) defaults to the file's name. The link guard
	(`src/tests/unit/wiki/links.spec.ts`) checks that every `path` written in a page is a file.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import { githubUrl } from "./github.ts";

	let {
		path,
		line,
		children,
	}: {
		/** From the project root: `src/lib/orders/lifecycle.ts`. */
		path: string;
		line?: number;
		children?: Snippet;
	} = $props();

	const href = $derived(githubUrl(path, line === undefined ? undefined : `L${line}`));
</script>

<a {href} target="_blank" rel="noopener noreferrer">
	{#if children}{@render children()}{:else}{path.split("/").at(-1)}{/if}
</a>
