<!--
	@component
	The site where an order's work is, for the order's page and the engineer portal: its name, and
	what to know before going there (`SiteDetails`). `title` names it, e.g. "Site".
-->
<script lang="ts">
	import type { ComponentProps } from "svelte";

	import type { SitePriority } from "#lib/models.ts";

	import SiteDetails from "./site-details.svelte";

	let {
		site,
		title,
	}: {
		site: ComponentProps<typeof SiteDetails>["site"] & { name: string; priority: SitePriority };
		title: string;
	} = $props();
</script>

<Card.Root data-site>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{site.name}</Card.Description>
		{#if site.priority === "high"}
			<Card.Action>
				<Badge variant="destructive">{m.customers_site_high_priority()}</Badge>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		<SiteDetails {site} />
	</Card.Content>
</Card.Root>
