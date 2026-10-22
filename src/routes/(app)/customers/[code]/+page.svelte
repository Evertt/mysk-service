<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import {
		ContactCard,
		CustomerFigures,
		EquipmentCard,
		PortalAccessCard,
		RecentActivity,
		SitesCard,
	} from "#lib/customers/components.ts";
	import { points } from "#lib/customers/extensions.ts";
	import { countryName, customerSegmentDisplay } from "#lib/customers/index.ts";
	import { deleteCustomer, getCustomer, getCustomerFormOptions } from "#lib/customers/remotes.ts";
	import { SiteLocations } from "#lib/equipment/components.ts";
	import { getCustomerLocations } from "#lib/equipment/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const [data, options, locations] = $derived(
		await Promise.all([
			getCustomer(params.code),
			getCustomerFormOptions(),
			getCustomerLocations(params.code),
		]),
	);
	// The locations at each site.
	const locationsAt = $derived(Map.groupBy(locations, (location) => location.siteId));
	const customer = $derived(data.customer);
</script>

<RecordPage
	title={customer.name}
	subtitle="{customer.code} · {customer.city}, {countryName(customer.country)}"
	list={{ label: m.customers_title(), href: resolve("/(app)/customers") }}
	edit={resolve("/(app)/customers/[code]/edit", { code: customer.code })}
	remove={{
		form: deleteCustomer,
		id: String(customer.id),
		title: m.customers_delete_title({ name: customer.name }),
		description: m.customers_delete_description(),
	}}
	subject={{ type: "customer", id: customer.id }}
	slots={points.detail}
	slotProps={{ code: customer.code }}
>
	{#snippet badges()}
		<EnumBadge display={customerSegmentDisplay} value={customer.segment} />
	{/snippet}

	{#snippet summary()}
		<CustomerFigures {data} />
	{/snippet}

	{#snippet main()}
		<SitesCard {customer} countries={options.countries}>
			{#snippet extra(site)}
				<SiteLocations {site} locations={locationsAt.get(site.id) ?? []} />
			{/snippet}
		</SitesCard>
		<EquipmentCard {customer} />
		<RecentActivity code={customer.code} />
	{/snippet}

	{#snippet side()}
		<ContactCard {customer} />
		<PortalAccessCard code={customer.code} />
	{/snippet}
</RecordPage>
