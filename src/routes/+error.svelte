<!--
	@component
	Errors outside the app shell, e.g. unknown URLs.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import ErrorView from "./error-view.svelte";
</script>

<svelte:head>
	<title>{page.status === 404 ? m.common_error_not_found() : m.common_error_generic()}</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center p-6">
	<ErrorView home={resolve("/(app)/(dashboard)")} homeLabel={m.common_error_back_to_dashboard()} />
</div>
