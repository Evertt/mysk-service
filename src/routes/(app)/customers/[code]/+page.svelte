<script lang="ts">
	import { resolve } from "$app/paths";
	import BanknoteIcon from "@lucide/svelte/icons/banknote";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import ChangedElsewhere from "#lib/components/activity/changed-elsewhere.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatTile from "#lib/components/stat-tile.svelte";
	import { PortalAccessCard, SegmentBadge, SitesCard } from "#lib/customers/components.ts";
	import { RecentActivity } from "#lib/customers/components.ts";
	import { detailMain, detailSide } from "#lib/customers/extensions.ts";
	import { countryName } from "#lib/customers/index.ts";
	import {
		deleteCustomer,
		getCustomer,
		getCustomerFormOptions,
		getCustomerRevenue,
	} from "#lib/customers/remotes.ts";
	import { getTimeZone } from "#lib/dates.ts";
	import {
		StatusBadge as EquipmentStatusBadge,
		EquipmentLink,
		SiteLocations,
	} from "#lib/equipment/components.ts";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { getCustomerLocations } from "#lib/equipment/remotes.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate, formatNumber, label } from "#lib/i18n/index.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getCustomer(params.code));
	const options = $derived(await getCustomerFormOptions());
	// The locations at each site.
	const locationsAt = $derived(
		Map.groupBy(await getCustomerLocations(params.code), (location) => location.siteId),
	);

	const customer = $derived(data.customer);
	const stats = $derived(data.stats);
	const needsAttention = $derived(
		customer.equipment.filter(
			(unit) => unit.status === "needs_service" || unit.status === "out_of_service",
		).length,
	);
	const location = $derived(`${customer.city}, ${countryName(customer.country)}`);
	const siteName = $derived(new Map(customer.sites.map((site) => [site.id, site.name])));
</script>

<svelte:head>
	<title>{customer.name} · {m.customers_title()}</title>
</svelte:head>

<PageHeader
	title={customer.name}
	description="{customer.code} · {location}"
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: customer.name },
	]}
>
	{#snippet badges()}
		<SegmentBadge segment={customer.segment} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/customers/[code]/edit", { code: customer.code })}
		>
			<PencilIcon data-icon="inline-start" />
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteCustomer}
			id={String(customer.id)}
			title={m.customers_delete_title({ name: customer.name })}
			description={m.customers_delete_description()}
		/>
	{/snippet}
</PageHeader>

<ChangedElsewhere type="customer" id={customer.id} />

<!-- The customer's key figures, as the SHLTR mockup's customer card has them: icon and label on
	the left, the figure on the right. -->
<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-customer-figures>
	<StatTile
		layout="row"
		tone="brand"
		icon={ClipboardListIcon}
		label={m.customers_column_open_orders()}
		value={formatNumber(stats.openOrders)}
		detail={m.customers_stats_orders_total({ count: stats.orders })}
	/>
	<StatTile
		layout="row"
		tone="brand"
		icon={BanknoteIcon}
		label={m.customers_stats_revenue()}
		value={formatCents((await getCustomerRevenue(customer.code)).revenue)}
		detail={m.customers_stats_revenue_orders({
			count: (await getCustomerRevenue(customer.code)).revenueOrders,
		})}
	/>
	<StatTile
		layout="row"
		tone={needsAttention ? "warning" : "brand"}
		icon={WrenchIcon}
		label={m.customers_column_equipment()}
		value={formatNumber(customer.equipment.length)}
		detail={needsAttention
			? m.customers_stats_attention({ count: needsAttention })
			: m.customers_stats_all_working()}
	/>
	<StatTile
		layout="row"
		tone="brand"
		icon={CalendarDaysIcon}
		label={m.customers_column_since()}
		value={String(customer.createdAt.toZonedDateTimeISO(getTimeZone()).year)}
		detail={stats.lastOrderAt
			? m.customers_stats_last_order({ date: formatDate(stats.lastOrderAt) })
			: m.customers_stats_no_orders()}
	/>
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<SitesCard {customer} countries={options.countries}>
			{#snippet extra(site)}
				<SiteLocations {site} locations={locationsAt.get(site.id) ?? []} />
			{/snippet}
		</SitesCard>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.customers_column_equipment()}</Card.Title>
				<Card.Description>
					{m.customers_equipment_description({ name: customer.name })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if customer.equipment.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.customers_equipment_column_model()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_site()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_category()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_installed()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_status()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each customer.equipment as unit (unit.id)}
								<Table.Row>
									<Table.Cell>
										<div class="flex flex-col">
											<EquipmentLink
												serialNumber={unit.serialNumber}
												class="font-medium underline-offset-4 hover:underline"
											>
												{unitTitle(unit)}
											</EquipmentLink>
											<span class="text-xs text-muted-foreground">
												{unitLine(unit)}
											</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										<div class="flex flex-col">
											<span>{siteName.get(unit.siteId)}</span>
											{#if unit.location}
												<a
													href={resolve("/(app)/equipment/locations/[id]", {
														id: String(unit.location.id),
													})}
													class="text-xs text-muted-foreground underline-offset-4 hover:underline"
												>
													{unit.location.name}
												</a>
											{/if}
										</div>
									</Table.Cell>
									<Table.Cell>{unit.category.name}</Table.Cell>
									<Table.Cell class="tabular-nums">{formatDate(unit.installedAt)}</Table.Cell>
									<Table.Cell><EquipmentStatusBadge status={unit.status} /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.customers_equipment_empty_title()}</Empty.Title>
							<Empty.Description>{m.customers_equipment_empty_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<RecentActivity code={customer.code} />

		<ExtensionSlot point={detailMain} props={{ code: customer.code }} />
	</div>

	<div class="flex min-w-0 flex-col gap-6">
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
					<DetailItem label={m.customers_column_location()} value={location} />
					<DetailItem label={m.customers_column_since()} value={formatDate(customer.createdAt)} />
				</dl>
			</Card.Content>
		</Card.Root>

		<PortalAccessCard code={customer.code} />

		<ExtensionSlot point={detailSide} props={{ code: customer.code }} />

		<ActivityCard type="customer" id={customer.id} />
	</div>
</div>
