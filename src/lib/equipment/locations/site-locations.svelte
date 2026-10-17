<!--
	@component
	A site's locations, under the site on the customer's sites card: each with how many units are
	there, to rename or delete, a button to add one, and a link to print the site's QR labels.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import type { ComponentProps } from "svelte";

	import LocationDialog from "./location-dialog.svelte";
	import LocationRow from "./location-row.svelte";

	let {
		site,
		locations,
	}: {
		site: { id: number; name: string };
		/** The site's, in their order (`getCustomerLocations`). */
		locations: ComponentProps<typeof LocationRow>["location"][];
	} = $props();

	let adding = $state(false);
</script>

<section class="flex flex-col gap-1" aria-label={m.equipment_locations_of({ site: site.name })}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h4 class="text-sm font-medium text-muted-foreground">{m.equipment_locations_title()}</h4>
		<div class="flex gap-1">
			<Button
				variant="ghost"
				size="sm"
				href={resolve("/(app)/equipment/labels/[site]", { site: String(site.id) })}
			>
				<PrinterIcon data-icon="inline-start" />
				{m.equipment_labels_print_site()}
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (adding = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.equipment_location_add()}
			</Button>
		</div>
	</div>
	{#if locations.length}
		<ul class="divide-y rounded-md border px-3">
			{#each locations as location (location.id)}
				<LocationRow {location} />
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-muted-foreground">{m.equipment_locations_none()}</p>
	{/if}
</section>

<LocationDialog siteId={site.id} bind:open={adding} />
