<!--
	@component
	The content of the error pages: a not-found or generic error message with a way back. The pages
	set the title themselves (a `<svelte:head>` in here breaks hydration of the root error page).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	const notFound = $derived(page.status === 404);
</script>

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
		<Button href={resolve("/(app)")}>{m.common_error_back_to_dashboard()}</Button>
	</Empty.Content>
</Empty.Root>
