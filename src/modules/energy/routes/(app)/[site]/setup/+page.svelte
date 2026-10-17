<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { formatKw } from "#modules/energy/display.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import ConsumerDialog from "#modules/energy/setup/consumer-dialog.svelte";
	import DeletePart from "#modules/energy/setup/delete-part.svelte";
	import DoorDialog from "#modules/energy/setup/door-dialog.svelte";
	import {
		deleteEnergyConsumer,
		deleteEnergyDoor,
		deleteEnergySite,
		deleteEnergyZone,
		getEnergySetup,
		saveEnergySite,
	} from "#modules/energy/setup/setup.remote.ts";
	import SiteFields from "#modules/energy/setup/site-fields.svelte";
	import ZoneDialog from "#modules/energy/setup/zone-dialog.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/setup"> } = $props();

	const siteId = $derived(Number(params.site));
	const setup = $derived(await getEnergySetup(siteId));
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

<svelte:head>
	<title>{m.energy_setup_title()} · {site.name}</title>
</svelte:head>

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
					if (await submit()) toast.success(m.energy_setup_saved({ name: site.name }));
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

	<Card.Root data-setup="zones">
		<Card.Header>
			<Card.Title>{m.energy_setup_zones_title()}</Card.Title>
			<Card.Description>
				{m.energy_setup_zones_description()}
				<a
					class="underline underline-offset-4"
					href={resolve("/(app)/(modules)/energy/[site]/thresholds", { site: params.site })}
					>{m.energy_thresholds_title()}</a
				>
			</Card.Description>
			<Card.Action><ZoneDialog siteId={site.id} /></Card.Action>
		</Card.Header>
		<Card.Content>
			{#if setup.zones.length}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.energy_setup_code()}</Table.Head>
								<Table.Head>{m.energy_setup_name()}</Table.Head>
								<Table.Head>{m.energy_setup_floor()}</Table.Head>
								<Table.Head class="text-right">{m.energy_setup_area()}</Table.Head>
								<Table.Head class="w-0"
									><span class="sr-only">{m.energy_setup_actions()}</span></Table.Head
								>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each setup.zones as zone (zone.id)}
								<Table.Row data-setup-zone={zone.code}>
									<Table.Cell class="font-mono">{zone.code}</Table.Cell>
									<Table.Cell>{zone.name}</Table.Cell>
									<Table.Cell>{zone.floor ?? "—"}</Table.Cell>
									<Table.Cell class="text-right tabular-nums"
										>{formatNumber(zone.areaM2)}</Table.Cell
									>
									<Table.Cell>
										<div class="flex justify-end gap-1">
											<ZoneDialog siteId={site.id} {zone} />
											<DeletePart
												form={deleteEnergyZone}
												siteId={site.id}
												id={zone.id}
												title={m.energy_setup_zone_delete({ code: zone.code })}
												description={m.energy_setup_zone_delete_description()}
												deleted={m.energy_setup_deleted({ name: zone.code })}
											/>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_setup_zones_none()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root data-setup="consumers">
		<Card.Header>
			<Card.Title>{m.energy_consumers_title()}</Card.Title>
			<Card.Description>{m.energy_setup_consumers_description()}</Card.Description>
			<Card.Action>
				<ConsumerDialog siteId={site.id} zones={zoneOptions} units={unitOptions} />
			</Card.Action>
		</Card.Header>
		<Card.Content>
			{#if setup.consumers.length}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.energy_setup_zone()}</Table.Head>
								<Table.Head>{m.energy_column_consumer()}</Table.Head>
								<Table.Head class="text-right">{m.energy_column_rated()}</Table.Head>
								<Table.Head>{m.energy_column_unit()}</Table.Head>
								<Table.Head class="w-0"
									><span class="sr-only">{m.energy_setup_actions()}</span></Table.Head
								>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each setup.consumers as consumer (consumer.id)}
								<Table.Row data-setup-consumer={consumer.name}>
									<Table.Cell class="font-mono">{zoneCode(consumer.zoneId)}</Table.Cell>
									<Table.Cell>{consumer.name}</Table.Cell>
									<Table.Cell class="text-right tabular-nums"
										>{formatKw(consumer.ratedKw)}</Table.Cell
									>
									<Table.Cell>{unitName(consumer.equipmentId)}</Table.Cell>
									<Table.Cell>
										<div class="flex justify-end gap-1">
											<ConsumerDialog
												siteId={site.id}
												zones={zoneOptions}
												units={unitOptions}
												{consumer}
											/>
											<DeletePart
												form={deleteEnergyConsumer}
												siteId={site.id}
												id={consumer.id}
												title={m.energy_setup_consumer_delete({ name: consumer.name })}
												description={m.energy_setup_consumer_delete_description()}
												deleted={m.energy_setup_deleted({ name: consumer.name })}
											/>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_consumers_none()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root data-setup="doors">
		<Card.Header>
			<Card.Title>{m.energy_doors_title()}</Card.Title>
			<Card.Description>{m.energy_setup_doors_description()}</Card.Description>
			<Card.Action>
				<DoorDialog siteId={site.id} zones={zoneOptions} units={unitOptions} />
			</Card.Action>
		</Card.Header>
		<Card.Content>
			{#if setup.doors.length}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.energy_setup_code()}</Table.Head>
								<Table.Head>{m.energy_setup_name()}</Table.Head>
								<Table.Head>{m.energy_setup_zone()}</Table.Head>
								<Table.Head>{m.energy_setup_kind()}</Table.Head>
								<Table.Head class="text-right">{m.energy_setup_loss()}</Table.Head>
								<Table.Head class="text-right">{m.energy_setup_minutes()}</Table.Head>
								<Table.Head>{m.energy_column_unit()}</Table.Head>
								<Table.Head class="w-0"
									><span class="sr-only">{m.energy_setup_actions()}</span></Table.Head
								>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each setup.doors as door (door.id)}
								<Table.Row data-setup-door={door.code}>
									<Table.Cell class="font-mono">{door.code}</Table.Cell>
									<Table.Cell>{door.name}</Table.Cell>
									<Table.Cell class="font-mono">{zoneCode(door.zoneId)}</Table.Cell>
									<Table.Cell>{energyLabels.label("doorKind", door.kind)}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{formatKw(door.lossKw)}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{formatNumber(door.thresholdMinutes)}
									</Table.Cell>
									<Table.Cell>{unitName(door.equipmentId)}</Table.Cell>
									<Table.Cell>
										<div class="flex justify-end gap-1">
											<DoorDialog siteId={site.id} zones={zoneOptions} units={unitOptions} {door} />
											<DeletePart
												form={deleteEnergyDoor}
												siteId={site.id}
												id={door.id}
												title={m.energy_setup_door_delete({ code: door.code })}
												description={m.energy_setup_door_delete_description()}
												deleted={m.energy_setup_deleted({ name: door.code })}
											/>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_setup_doors_none()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<ActivityCard type="energy_site" id={site.id} />
</div>
