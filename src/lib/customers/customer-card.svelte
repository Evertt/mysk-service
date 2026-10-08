<!--
	@component
	A customer's contact details, for the page of a record that belongs to a customer (an order, a
	contract, a piece of equipment). `title` names the role, e.g. "Customer" or "Owner".
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import DetailItem from "#lib/components/detail-item.svelte";
	import type { CustomerSegment } from "#lib/models.ts";

	import { countryName } from "./countries.ts";
	import SegmentBadge from "./segment-badge.svelte";

	let {
		customer,
		title,
	}: {
		customer: {
			code: string;
			name: string;
			segment: CustomerSegment;
			contactName: string;
			email: string;
			phone: string;
			city: string;
			country: string;
		};
		title: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{customer.code}</Card.Description>
		<Card.Action>
			<SegmentBadge segment={customer.segment} />
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<dl class="grid grid-cols-2 gap-4">
			<DetailItem
				label={m.customers_card_company()}
				value={customer.name}
				href={resolve("/(app)/customers/[code]", { code: customer.code })}
			/>
			<DetailItem label={m.customers_card_contact()} value={customer.contactName} />
			<DetailItem
				label={m.customers_card_email()}
				value={customer.email}
				href={`mailto:${customer.email}`}
			/>
			<DetailItem
				label={m.customers_card_phone()}
				value={customer.phone}
				href={`tel:${customer.phone}`}
			/>
			<DetailItem
				label={m.customers_card_location()}
				value={`${customer.city}, ${countryName(customer.country)}`}
			/>
		</dl>
	</Card.Content>
</Card.Root>
