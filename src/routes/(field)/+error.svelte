<!--
	@component
	Errors in the engineer portal (e.g. an order that isn't theirs), within its shell.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import ErrorView from "../error-view.svelte";
</script>

<svelte:head>
	<title>{page.status === 404 ? m.common_error_not_found() : m.common_error_generic()}</title>
</svelte:head>

<ErrorView home={resolve("/(field)/my")} homeLabel={m.common_error_back_to_my_work()} size="lg" />
