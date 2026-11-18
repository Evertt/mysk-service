<!--
	@component
	Errors in the customer portal (e.g. an order or unit of another customer), within its shell: its
	app bar, with the way home, over what went wrong.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import AppBar from "#lib/client/app-bar.svelte";

	import ErrorView from "../error-view.svelte";
</script>

<AppBar
	title={page.status === 404 ? m.common_error_not_found() : m.common_error_generic()}
	back={{ href: resolve("/(customer)/portal"), label: m.common_error_back_to_portal() }}
/>

<ErrorView
	home={resolve("/(customer)/portal")}
	homeLabel={m.common_error_back_to_portal()}
	size="lg"
/>
