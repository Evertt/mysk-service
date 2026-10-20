<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { getDockSettings } from "#modules/docks/settings/settings.remote.ts";
	import TokensCard from "#modules/docks/settings/tokens-card.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/docks/settings"> } = $props();

	const settings = $derived(await getDockSettings());
	// Where the Salvo integration posts its events (`routes/(api)/ingest/+server.ts`).
	const ingestUrl = $derived(new URL("/docks/ingest", page.url.origin).toString());
</script>

<svelte:head>
	<title>{m.docks_settings_title()} · {m.docks_title()}</title>
</svelte:head>

<div class="flex max-w-4xl flex-col gap-6">
	<PageHeader
		title={m.docks_settings_title()}
		description={m.docks_settings_description({ url: ingestUrl })}
		breadcrumbs={[
			{ label: m.docks_title(), href: resolve("/(app)/(modules)/docks") },
			{ label: m.docks_settings_title() },
		]}
	/>

	<TokensCard tokens={settings.tokens} canManage={settings.canManage} />

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
</div>
