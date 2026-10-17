<!--
	@component
	Where a scanned unit or location is, in the engineer portal: the customer, the site's address,
	the location there and what to know before going in.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";

	let {
		site,
		location,
	}: {
		site: {
			name: string;
			address: string;
			postalCode: string;
			city: string;
			accessNotes: string | null;
			customer: string;
		};
		location?: string | null;
	} = $props();

	const address = $derived(
		[site.address, [site.postalCode, site.city].filter(Boolean).join(" ")]
			.filter(Boolean)
			.join(", "),
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{site.customer}</Card.Title>
		<Card.Description>{site.name}</Card.Description>
	</Card.Header>
	<Card.Content>
		<dl class="grid gap-4">
			<DetailItem label={m.portal_address()} value={address} />
			{#if location}
				<DetailItem label={m.portal_location()} value={location} />
			{/if}
			{#if site.accessNotes}
				<DetailItem label={m.portal_access_notes()} value={site.accessNotes} />
			{/if}
		</dl>
	</Card.Content>
</Card.Root>
