<script lang="ts">
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import { CustomerLink } from "#lib/customers/components.ts";
	import IntegrationTokensCard from "#lib/modules/settings/integration-tokens-card.svelte";
	import ModuleSettingsPage from "#lib/modules/settings/module-settings-page.svelte";
	import { getDockSettings } from "#modules/docks/settings/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/docks/settings"> } = $props();

	const settings = $derived(await getDockSettings());
	// Where the Salvo integration posts its events (`routes/(api)/ingest/+server.ts`).
	const ingestUrl = $derived(new URL("/docks/ingest", page.url.origin).toString());
</script>

<ModuleSettingsPage
	module="docks"
	title={m.docks_settings_title()}
	description={m.docks_settings_description({ url: ingestUrl })}
>
	<IntegrationTokensCard module="docks" placeholder="Salvo Barneveld" />

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.docks_settings_docks_title()}</Card.Title>
			<Card.Description>{m.docks_settings_docks_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if settings.docks.length}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.docks_column_dock()}</Table.Head>
								<Table.Head>{m.docks_column_customer()}</Table.Head>
								<Table.Head>{m.docks_column_site()}</Table.Head>
								<Table.Head>{m.docks_column_salvo()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each settings.docks as dock (dock.id)}
								<Table.Row>
									<Table.Cell>
										<span class="font-mono">{dock.code}</span>
										<span class="text-muted-foreground">{dock.position}</span>
									</Table.Cell>
									<Table.Cell>
										<CustomerLink
											code={dock.customer.code}
											name={dock.customer.name}
											class="underline-offset-4 hover:underline"
										/>
									</Table.Cell>
									<Table.Cell>{dock.site.name}</Table.Cell>
									<Table.Cell class="font-mono text-xs">{dock.scpCode ?? "—"}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.docks_no_docks_description()}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</ModuleSettingsPage>
