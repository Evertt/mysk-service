<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import {
		EquipmentLink,
		LocationDialog,
		LocationHistory,
		QrCard,
	} from "#lib/equipment/components.ts";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import { deleteLocation, getLocation } from "#lib/equipment/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getLocation(params.id));
	const location = $derived(data.location);
	const site = $derived(location.site);
	const owner = $derived(location.site.customer);
	const customerHref = $derived(resolve("/(app)/customers/[code]", { code: owner.code }));
	const labelsHref = $derived(
		`${resolve("/(app)/equipment/labels/[site]", { site: String(site.id) })}?location=${location.id}`,
	);

	let editing = $state(false);
	let deleting = $state(false);
	const remove = $derived(deleteLocation.for(String(location.id)));
</script>

<svelte:head>
	<title>{location.name} · {owner.name}</title>
</svelte:head>

<PageHeader
	title={location.name}
	description="{owner.name} · {site.name}"
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: owner.name, href: customerHref },
		{ label: location.name },
	]}
>
	{#snippet actions()}
		<Button variant="outline" href={labelsHref}>
			<PrinterIcon data-icon="inline-start" />
			{m.equipment_labels_print()}
		</Button>
		<Button variant="outline" onclick={() => (editing = true)}>
			<PencilIcon data-icon="inline-start" />
			{m.common_edit()}
		</Button>
		<Button variant="outline" onclick={() => (deleting = true)}>
			<Trash2Icon data-icon="inline-start" />
			{m.common_delete()}
		</Button>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root data-testid="location-units">
			<Card.Header>
				<Card.Title>{m.equipment_location_units_title()}</Card.Title>
				<Card.Description>{m.common_count_units({ count: data.units.length })}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.units.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.equipment_column_unit()}</Table.Head>
								<Table.Head>{m.equipment_column_category()}</Table.Head>
								<Table.Head>{m.equipment_column_status()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.units as unit (unit.id)}
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
									<Table.Cell>{unit.category}</Table.Cell>
									<Table.Cell
										><EnumBadge display={equipmentStatusDisplay} value={unit.status} /></Table.Cell
									>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="border p-6">
						<Empty.Header>
							<Empty.Title>{m.equipment_location_units_empty()}</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<LocationHistory orders={data.orders} />
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.equipment_location_details()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid gap-4">
					<DetailItem label={m.equipment_owner_company()}>
						<CustomerLink
							code={owner.code}
							name={owner.name}
							class="underline-offset-4 hover:underline"
						/>
					</DetailItem>
					<DetailItem
						label={m.equipment_detail_site()}
						value={site.name.includes(site.city) ? site.name : `${site.name}, ${site.city}`}
					/>
					{#if location.description}
						<DetailItem
							label={m.equipment_location_field_description()}
							value={location.description}
						/>
					{/if}
				</dl>
			</Card.Content>
		</Card.Root>

		<QrCard token={location.qrToken} name={location.name} printHref={labelsHref} />

		<ActivityCard type="location" id={location.id} />
	</div>
</div>

<LocationDialog siteId={site.id} {location} bind:open={editing} />

<!-- Refused while units are there. -->
<ConfirmDialog
	form={remove}
	hidden={{ id: String(location.id) }}
	title={m.equipment_location_delete_title({ name: location.name })}
	description={m.equipment_location_delete_description()}
	confirmLabel={m.common_delete()}
	destructive
	done={m.equipment_location_deleted()}
	leave={customerHref}
	bind:open={deleting}
/>
