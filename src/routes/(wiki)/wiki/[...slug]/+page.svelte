<!--
	@component
	A wiki page: its component, inside the wiki's shell.
-->
<script lang="ts">
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
	const Page = $derived(data.component);
</script>

<svelte:head>
	<title>{data.page.title} · Fieldworks wiki</title>
</svelte:head>

<h1>{data.page.title}</h1>
<Page />
