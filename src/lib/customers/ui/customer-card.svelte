<!--
	@component
	A customer's contact details, for the page of a record that belongs to a customer (an order, a
	contract, a piece of equipment). `title` names the role, e.g. "Customer" or "Owner".
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import type { CustomerSegment } from "#lib/models.ts";

	import { countryName } from "../countries.ts";
	import CustomerLink from "./customer-link.svelte";
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
			<DetailItem label={m.customers_card_company()}>
				<CustomerLink
					code={customer.code}
					name={customer.name}
					class="underline-offset-4 hover:underline"
				/>
			</DetailItem>
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
