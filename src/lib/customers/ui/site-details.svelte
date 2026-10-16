<!--
	@component
	What to know of a customer's site before going there: its address, who to ask for, when a visit
	suits it and how to get in. For the customer's sites card, and an order's site in the office and
	on the engineer portal.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatTimeSlot, label } from "#lib/i18n/index.ts";
	import type { ContactChannel, Weekday } from "#lib/models.ts";

	import { countryName } from "../countries.ts";

	let {
		site,
	}: {
		site: {
			address: string;
			postalCode: string;
			city: string;
			country: string;
			contactName: string | null;
			contactPhone: string | null;
			contactEmail: string | null;
			contactChannel: ContactChannel | null;
			preferredDay: Weekday | null;
			slotStart: string | null;
			slotEnd: string | null;
			accessNotes: string | null;
		};
	} = $props();

	const place = $derived([site.postalCode, site.city].filter(Boolean).join(" "));
	const hasContact = $derived(!!(site.contactName || site.contactPhone || site.contactEmail));
</script>

<dl class="grid grid-cols-2 gap-4">
	<DetailItem label={m.customers_site_field_address()}>
		<address class="not-italic">
			{#if site.address}
				{site.address}<br />
			{:else}
				<span class="text-muted-foreground">{m.customers_site_address_missing()}</span><br />
			{/if}
			{place}<br />
			{countryName(site.country)}
		</address>
	</DetailItem>
	<DetailItem label={m.customers_site_field_contact()}>
		{#if hasContact}
			<span class="flex flex-col">
				{#if site.contactName}<span>{site.contactName}</span>{/if}
				{#if site.contactPhone}
					<a href="tel:{site.contactPhone}" class="underline-offset-4 hover:underline">
						{site.contactPhone}
					</a>
				{/if}
				{#if site.contactEmail}
					<a href="mailto:{site.contactEmail}" class="underline-offset-4 hover:underline">
						{site.contactEmail}
					</a>
				{/if}
			</span>
		{:else}
			—
		{/if}
	</DetailItem>
	<DetailItem
		label={m.customers_site_field_slot()}
		value={site.slotStart && site.slotEnd
			? formatTimeSlot(site.slotStart, site.slotEnd)
			: m.customers_site_no_preference()}
	/>
	<DetailItem
		label={m.customers_site_field_day()}
		value={site.preferredDay
			? label("weekday", site.preferredDay)
			: m.customers_site_no_preference()}
	/>
	<DetailItem
		label={m.customers_site_field_channel()}
		value={site.contactChannel && label("contactChannel", site.contactChannel)}
	/>
</dl>
{#if site.accessNotes}
	<dl class="mt-4">
		<DetailItem label={m.customers_site_field_access_notes()}>
			<span class="whitespace-pre-line">{site.accessNotes}</span>
		</DetailItem>
	</dl>
{/if}
