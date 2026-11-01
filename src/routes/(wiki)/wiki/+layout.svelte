<!--
	@component
	The wiki's layout: its shell around every page (`src/wiki/wiki-shell.svelte`).
-->
<script lang="ts">
	import WikiShell from "#wiki/wiki-shell.svelte";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<WikiShell>
	{@render children()}
</WikiShell>
