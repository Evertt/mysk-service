<!--
	@component
	A customer's contact on their page: who to ask for, how to reach them, where the customer is and
	since when.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import { countryName } from "../countries.ts";
	import type { getCustomer } from "../customers.remote.ts";

	let {
		customer,
	}: {
		customer: Pick<
			Awaited<ReturnType<typeof getCustomer>>["customer"],
			"code" | "contactName" | "email" | "phone" | "city" | "country" | "createdAt"
		>;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.customers_column_contact()}</Card.Title>
		<Card.Description>{customer.code}</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- One column for the contact details, so email addresses don't wrap. -->
		<dl class="grid gap-4">
			<DetailItem label={m.customers_field_contact_name()} value={customer.contactName} />
			<DetailItem
				label={m.customers_field_email()}
				value={customer.email}
				href={`mailto:${customer.email}`}
			/>
			<DetailItem
				label={m.customers_field_phone()}
				value={customer.phone}
				href={`tel:${customer.phone}`}
			/>
			<DetailItem
				label={m.customers_column_location()}
				value={`${customer.city}, ${countryName(customer.country)}`}
			/>
			<DetailItem label={m.customers_column_since()} value={formatDate(customer.createdAt)} />
		</dl>
	</Card.Content>
</Card.Root>
