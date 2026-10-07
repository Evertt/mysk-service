<!--
	@component
	Errors in the engineer portal (e.g. an order that isn't theirs), within its shell.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? "Not found" : "Something went wrong"}</title>
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
		<Empty.Title>{notFound ? "Not found" : "Something went wrong"}</Empty.Title>
		<Empty.Description>
			{page.error?.message ?? "An unexpected error occurred."} ({page.status})
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button href={resolve("/(field)/my")} size="lg">Back to my work</Button>
	</Empty.Content>
</Empty.Root>
