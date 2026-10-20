<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { formatKw } from "#modules/energy/display.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import ConsumerDialog from "#modules/energy/setup/consumer-dialog.svelte";
	import DoorDialog from "#modules/energy/setup/door-dialog.svelte";
	import PartsCard from "#modules/energy/setup/parts-card.svelte";
	import {
		deleteEnergyConsumer,
		deleteEnergyDoor,
		deleteEnergySite,
		deleteEnergyZone,
		getEnergySetup,
		saveEnergySite,
		watchEnergySetup,
	} from "#modules/energy/setup/setup.remote.ts";
	import SiteFields from "#modules/energy/setup/site-fields.svelte";
	import ZoneDialog from "#modules/energy/setup/zone-dialog.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/setup"> } = $props();

	const siteId = $derived(Number(params.site));
	const setup = $derived(await getEnergySetup(siteId));
	refreshOnChange(
		() => watchEnergySetup(siteId),
		() => getEnergySetup(siteId).refresh(),
	);
	const site = $derived(setup.site);
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));

	const zoneOptions = $derived(
		setup.zones.map((zone) => ({ value: String(zone.id), label: `${zone.code} · ${zone.name}` })),
	);
	const unitOptions = $derived(
		setup.units.map((unit) => ({
			value: String(unit.id),
			label: `${unit.name ?? unit.serialNumber} (${unit.category})`,
		})),
	);
	const zoneCode = (id: number) => setup.zones.find((zone) => zone.id === id)?.code ?? "";
	const unitName = (id: number | null) => {
		const unit = setup.units.find((each) => each.id === id);
		return unit ? (unit.name ?? unit.serialNumber) : "—";
	};
</script>

<div class="flex max-w-5xl flex-col gap-6">
	<PageHeader
		title={m.energy_setup_title()}
		description={m.energy_setup_description({
			customer: site.customerName ?? "",
			site: site.siteName ?? "",
			id: String(site.id),
		})}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: site.name, href: siteHref },
			{ label: m.energy_setup_title() },
		]}
	>
		{#snippet actions()}
			<DeleteDialog
				form={deleteEnergySite}
				id={String(site.id)}
				title={m.energy_setup_site_delete_title({ name: site.name })}
				description={m.energy_setup_site_delete_description()}
			/>
		{/snippet}
	</PageHeader>

	<Card.Root data-setup="site">
		<Card.Header>
			<Card.Title>{m.energy_setup_site_title()}</Card.Title>
			<Card.Description>{m.energy_setup_site_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				{...saveEnergySite.enhance(async ({ submit }) => {
					if (await submitted(submit)) toast.success(m.energy_setup_saved({ name: site.name }));
				})}
				class="flex flex-col gap-6"
			>
				<input {...saveEnergySite.fields.energySiteId.as("hidden", String(site.id))} />
				<SiteFields fields={saveEnergySite.fields} {site} />
				<Field.FieldError errors={saveEnergySite.fields.issues()} />
				<div>
					<SubmitButton pending={saveEnergySite.pending}>{m.common_save()}</SubmitButton>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<PartsCard
		kind="zone"
		siteId={site.id}
		title={m.energy_setup_zones_title()}
		parts={setup.zones}
		name={(zone) => zone.code}
		empty={m.energy_setup_zones_none()}
		remove={{
			form: deleteEnergyZone,
			title: (zone) => m.energy_setup_zone_delete({ code: zone.code }),
			description: m.energy_setup_zone_delete_description(),
		}}
	>
		{#snippet description()}
			{m.energy_setup_zones_description()}
			<a
				class="underline underline-offset-4"
				href={resolve("/(app)/(modules)/energy/[site]/thresholds", { site: params.site })}
				>{m.energy_thresholds_title()}</a
			>
		{/snippet}
		{#snippet add()}<ZoneDialog siteId={site.id} />{/snippet}
		{#snippet heads()}
			<Table.Head>{m.energy_setup_code()}</Table.Head>
			<Table.Head>{m.energy_setup_name()}</Table.Head>
			<Table.Head>{m.energy_setup_floor()}</Table.Head>
			<Table.Head class="text-right">{m.energy_setup_area()}</Table.Head>
		{/snippet}
		{#snippet cells(zone)}
			<Table.Cell class="font-mono">{zone.code}</Table.Cell>
			<Table.Cell>{zone.name}</Table.Cell>
			<Table.Cell>{zone.floor ?? "—"}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatNumber(zone.areaM2)}</Table.Cell>
		{/snippet}
		{#snippet edit(zone)}<ZoneDialog siteId={site.id} {zone} />{/snippet}
	</PartsCard>

	<PartsCard
		kind="consumer"
		siteId={site.id}
		title={m.energy_consumers_title()}
		description={m.energy_setup_consumers_description()}
		parts={setup.consumers}
		name={(consumer) => consumer.name}
		empty={m.energy_consumers_none()}
		remove={{
			form: deleteEnergyConsumer,
			title: (consumer) => m.energy_setup_consumer_delete({ name: consumer.name }),
			description: m.energy_setup_consumer_delete_description(),
		}}
	>
		{#snippet add()}
			<ConsumerDialog siteId={site.id} zones={zoneOptions} units={unitOptions} />
		{/snippet}
		{#snippet heads()}
			<Table.Head>{m.energy_setup_zone()}</Table.Head>
			<Table.Head>{m.energy_column_consumer()}</Table.Head>
			<Table.Head class="text-right">{m.energy_column_rated()}</Table.Head>
			<Table.Head>{m.energy_column_unit()}</Table.Head>
		{/snippet}
		{#snippet cells(consumer)}
			<Table.Cell class="font-mono">{zoneCode(consumer.zoneId)}</Table.Cell>
			<Table.Cell>{consumer.name}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatKw(consumer.ratedKw)}</Table.Cell>
			<Table.Cell>{unitName(consumer.equipmentId)}</Table.Cell>
		{/snippet}
		{#snippet edit(consumer)}
			<ConsumerDialog siteId={site.id} zones={zoneOptions} units={unitOptions} {consumer} />
		{/snippet}
	</PartsCard>

	<PartsCard
		kind="door"
		siteId={site.id}
		title={m.energy_doors_title()}
		description={m.energy_setup_doors_description()}
		parts={setup.doors}
		name={(door) => door.code}
		empty={m.energy_setup_doors_none()}
		remove={{
			form: deleteEnergyDoor,
			title: (door) => m.energy_setup_door_delete({ code: door.code }),
			description: m.energy_setup_door_delete_description(),
		}}
	>
		{#snippet add()}
			<DoorDialog siteId={site.id} zones={zoneOptions} units={unitOptions} />
		{/snippet}
		{#snippet heads()}
			<Table.Head>{m.energy_setup_code()}</Table.Head>
			<Table.Head>{m.energy_setup_name()}</Table.Head>
			<Table.Head>{m.energy_setup_zone()}</Table.Head>
			<Table.Head>{m.energy_setup_kind()}</Table.Head>
			<Table.Head class="text-right">{m.energy_setup_loss()}</Table.Head>
			<Table.Head class="text-right">{m.energy_setup_minutes()}</Table.Head>
			<Table.Head>{m.energy_column_unit()}</Table.Head>
		{/snippet}
		{#snippet cells(door)}
			<Table.Cell class="font-mono">{door.code}</Table.Cell>
			<Table.Cell>{door.name}</Table.Cell>
			<Table.Cell class="font-mono">{zoneCode(door.zoneId)}</Table.Cell>
			<Table.Cell>{energyLabels.label("doorKind", door.kind)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatKw(door.lossKw)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatNumber(door.thresholdMinutes)}</Table.Cell>
			<Table.Cell>{unitName(door.equipmentId)}</Table.Cell>
		{/snippet}
		{#snippet edit(door)}
			<DoorDialog siteId={site.id} zones={zoneOptions} units={unitOptions} {door} />
		{/snippet}
	</PartsCard>

	<ActivityCard type="energy_site" id={site.id} />
</div>
