<!--
	@component
	Errors in the wiki (an unknown page), within its shell, with the way back to the wiki: the root's
	error page offers the dashboard, which sends a signed-out visitor to the login page.
-->
<script lang="ts">
	import { page } from "$app/state";

	import ErrorView from "../../error-view.svelte";
</script>

<svelte:head>
	<title
		>{page.status === 404 ? m.wiki_page_not_found() : m.common_error_generic()} · {m.wiki_title({
			name: m.common_app_name(),
		})}</title
	>
</svelte:head>

<div class="not-prose flex items-center justify-center py-12">
	<ErrorView home="/wiki" homeLabel={m.wiki_back()} />
</div>
