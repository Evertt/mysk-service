<!--
	@component
	A customer's equipment on their page: each unit's name (linked to its page) and make, its site
	and location, category, installation date and status.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { EquipmentLink } from "#lib/equipment/components.ts";
	import { equipmentStatusDisplay, unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getCustomer } from "../customers.remote.ts";

	let {
		customer,
	}: {
		customer: Pick<
			Awaited<ReturnType<typeof getCustomer>>["customer"],
			"name" | "sites" | "equipment"
		>;
	} = $props();

	const siteName = $derived(new Map(customer.sites.map((site) => [site.id, site.name])));
</script>

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
							<Table.Cell>
								<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
							</Table.Cell>
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
