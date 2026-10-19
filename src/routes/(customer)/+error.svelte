<!--
	@component
	Errors in the customer portal (e.g. an order or unit of another customer), within its shell.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import ErrorView from "../error-view.svelte";
</script>

<svelte:head>
	<title>{page.status === 404 ? m.common_error_not_found() : m.common_error_generic()}</title>
</svelte:head>

<ErrorView
	home={resolve("/(customer)/portal")}
	homeLabel={m.common_error_back_to_portal()}
	size="lg"
/>
