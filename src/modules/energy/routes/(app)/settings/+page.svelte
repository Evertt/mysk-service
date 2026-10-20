<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import { canManage } from "#lib/auth/can-manage.ts";
	import IntegrationTokensCard from "#lib/modules/settings/integration-tokens-card.svelte";
	import ModuleSettingsPage from "#lib/modules/settings/module-settings-page.svelte";
	import { getEnergySettings } from "#modules/energy/settings/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/energy/settings"> } = $props();

	const settings = $derived(await getEnergySettings());
	const manager = $derived(await canManage());
	// Where the gateways post their readings (`routes/(api)/ingest/+server.ts`).
	const ingestUrl = $derived(new URL("/energy/ingest", page.url.origin).toString());
</script>

<ModuleSettingsPage
	module="energy"
	title={m.energy_settings_title()}
	description={m.energy_settings_description({ url: ingestUrl })}
>
	<IntegrationTokensCard module="energy" placeholder="P1-gateway Ede" />

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.energy_settings_sites_title()}</Card.Title>
			<Card.Description>{m.energy_settings_sites_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if settings.sites.length}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.energy_column_site_id()}</Table.Head>
								<Table.Head>{m.energy_column_site()}</Table.Head>
								<Table.Head>{m.energy_column_zones()}</Table.Head>
								<Table.Head>{m.energy_column_doors()}</Table.Head>
								{#if manager}
									<Table.Head class="w-0"
										><span class="sr-only">{m.energy_setup_actions()}</span></Table.Head
									>
								{/if}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each settings.sites as site (site.id)}
								<Table.Row data-site-codes={site.id}>
									<Table.Cell class="font-mono">{site.id}</Table.Cell>
									<Table.Cell>
										<a
											class="underline-offset-4 hover:underline"
											href={resolve("/(app)/(modules)/energy/[site]", { site: String(site.id) })}
											>{site.name}</a
										>
									</Table.Cell>
									<Table.Cell class="font-mono text-xs">{site.zones.join(", ")}</Table.Cell>
									<Table.Cell class="font-mono text-xs">{site.doors.join(", ") || "—"}</Table.Cell>
									<!-- A site's setup is the managers'. -->
									{#if manager}
										<Table.Cell>
											<Button
												variant="outline"
												size="sm"
												href={resolve("/(app)/(modules)/energy/[site]/setup", {
													site: String(site.id),
												})}>{m.energy_setup_title()}</Button
											>
										</Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_no_sites()}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</ModuleSettingsPage>
