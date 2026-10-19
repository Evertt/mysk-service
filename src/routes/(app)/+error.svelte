<!--
	@component
	Errors inside the app (e.g. an unknown order), shown within the sidebar and header. Having this
	boundary inside `(app)` also keeps hydration consistent when a page's query throws the error.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import ErrorView from "../error-view.svelte";
</script>

<svelte:head>
	<title>{page.status === 404 ? m.common_error_not_found() : m.common_error_generic()}</title>
</svelte:head>

<div class="flex flex-1 items-center justify-center p-6">
	<ErrorView home={resolve("/(app)/(dashboard)")} homeLabel={m.common_error_back_to_dashboard()} />
</div>
