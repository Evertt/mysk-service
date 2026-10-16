<!--
	@component
	A customer's sites on their page: each with its address, preferences, time slot and access
	notes, to edit or delete, and a button to add one.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import type { ComponentProps } from "svelte";

	import SiteDialog from "../form/site-dialog.svelte";
	import SiteRow from "./site-row.svelte";

	let {
		customer,
		countries,
	}: {
		customer: {
			id: number;
			name: string;
			city: string;
			country: string;
			sites: ComponentProps<typeof SiteRow>["site"][];
		};
		/** The countries to choose from (`getCustomerFormOptions`). */
		countries: string[];
	} = $props();

	let adding = $state(false);
</script>

<Card.Root data-testid="sites">
	<Card.Header>
		<Card.Title>{m.customers_sites_title()}</Card.Title>
		<Card.Description>{m.customers_sites_description({ name: customer.name })}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (adding = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.customers_site_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<ul class="divide-y">
			{#each customer.sites as site (site.id)}
				<SiteRow {site} {customer} {countries} />
			{/each}
		</ul>
	</Card.Content>
</Card.Root>

<SiteDialog {customer} {countries} bind:open={adding} />
