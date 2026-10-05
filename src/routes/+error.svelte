<!--
	@component
	Errors outside the app shell, e.g. unknown URLs.
-->
<script lang="ts">
	import { page } from "$app/state";

	import ErrorView from "./error-view.svelte";
</script>

<svelte:head>
	<title>{page.status === 404 ? "Not found" : "Something went wrong"}</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center p-6">
	<ErrorView />
</div>
