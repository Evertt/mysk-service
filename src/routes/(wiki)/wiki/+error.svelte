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
	<title>{page.status === 404 ? "Page not found" : "Something went wrong"} · Fieldworks wiki</title>
</svelte:head>

<div class="not-prose flex items-center justify-center py-12">
	<ErrorView home="/wiki" homeLabel="Back to the wiki" />
</div>
