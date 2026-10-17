<!--
	@component
	Errors in the customer portal (e.g. an order or unit of another customer), within its shell.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? m.common_error_not_found() : m.common_error_generic()}</title>
</svelte:head>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			{#if notFound}
				<SearchXIcon />
			{:else}
				<TriangleAlertIcon />
			{/if}
		</Empty.Media>
		<Empty.Title>{notFound ? m.common_error_not_found() : m.common_error_generic()}</Empty.Title>
		<Empty.Description>
			{page.error?.message ?? m.common_error_unexpected()} ({page.status})
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button href={resolve("/(customer)/portal")} size="lg">{m.common_error_back_to_portal()}</Button
		>
	</Empty.Content>
</Empty.Root>
