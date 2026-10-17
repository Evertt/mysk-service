<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getEnergySettings } from "#modules/energy/settings/settings.remote.ts";
	import TokensCard from "#modules/energy/settings/tokens-card.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/energy/settings"> } = $props();

	const settings = $derived(await getEnergySettings());
	// Where the gateways post their readings (`routes/(api)/ingest/+server.ts`).
	const ingestUrl = $derived(new URL("/energy/ingest", page.url.origin).toString());
</script>

<svelte:head>
	<title>{m.energy_settings_title()} · {m.energy_title()}</title>
</svelte:head>

<div class="flex max-w-4xl flex-col gap-6">
	<PageHeader
		title={m.energy_settings_title()}
		description={m.energy_settings_description({ url: ingestUrl })}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: m.energy_settings_title() },
		]}
	/>

	<TokensCard tokens={settings.tokens} />

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
								<Table.Head class="w-0"
									><span class="sr-only">{m.energy_setup_actions()}</span></Table.Head
								>
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
									<Table.Cell>
										<Button
											variant="outline"
											size="sm"
											href={resolve("/(app)/(modules)/energy/[site]/setup", {
												site: String(site.id),
											})}>{m.energy_setup_title()}</Button
										>
									</Table.Cell>
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
</div>
