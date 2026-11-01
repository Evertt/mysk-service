<!--
	@component
	One `order` table, two tenants: run a query as North or South, with the tenant's scope
	(`inTenant()`, `idInTenant()`) or without, for every order or one by its id, and see the
	statement, the rows it reaches and what comes back. Without the scope, an id from the client
	reads another tenant's order: the leak every query's scope prevents.
-->
<script lang="ts">
	import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

	import Callout from "#lib/components/callout.svelte";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import InlineCode from "#wiki/parts/inline-code.svelte";

	import TenancyDiagram from "./tenancy-diagram.svelte";
	import { type FixtureOrder, fixtureOrders, runQuery } from "./tenancy.ts";

	const id = $props.id();

	let tenant = $state<FixtureOrder["organization"]>("North");
	let scoped = $state(true);
	let asked = $state("");

	const orderId = $derived(asked === "" ? undefined : Number(asked));
	const answer = $derived(runQuery({ tenant, scoped, id: orderId }));
	const rows = $derived("rows" in answer ? answer.rows : []);
	const owner = $derived(fixtureOrders.find((order) => order.id === orderId)?.organization);
	const leaks = $derived(rows.filter((order) => order.organization !== tenant).length);
</script>

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="flex flex-col gap-3 @xl:flex-row @xl:flex-wrap @xl:items-end @xl:gap-x-6">
		<div class="grid gap-1.5">
			<span class="text-xs font-medium text-muted-foreground">{m.wiki_tenancy_signed_in()}</span>
			<FilterChips
				label={m.wiki_tenancy_signed_in()}
				options={[
					{ label: "North", value: "North" },
					{ label: "South", value: "South" },
				]}
				value={tenant}
				onchange={(chosen) => {
					if (chosen === "North" || chosen === "South") tenant = chosen;
				}}
			/>
		</div>
		<div class="grid gap-1.5">
			<Label for="{id}-order" class="text-xs text-muted-foreground"
				>{m.wiki_tenancy_reading()}</Label
			>
			<NativeSelect.Root id="{id}-order" bind:value={asked} size="sm">
				<NativeSelect.Option value="">{m.wiki_tenancy_every_order()}</NativeSelect.Option>
				{#each fixtureOrders as order (order.id)}
					<NativeSelect.Option value={String(order.id)}>
						{m.wiki_tenancy_order({ id: String(order.id), tenant: order.organization })}
					</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>
		<div class="flex items-center gap-2 @xl:h-8">
			<Switch id="{id}-scoped" bind:checked={scoped} />
			<Label for="{id}-scoped"><InlineCode text={m.wiki_tenancy_scoped()} /></Label>
		</div>
	</div>

	<div class="mt-4 grid gap-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @xl:items-center">
		<pre
			class="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground"
			aria-label={m.wiki_tenancy_query()}><code>{answer.sql}</code></pre>
		<TenancyDiagram {tenant} {rows} refusedId={"refused" in answer ? orderId : undefined} />
	</div>

	<div class="mt-4" aria-live="polite">
		{#if "refused" in answer}
			<Callout tone="success" icon={ShieldCheckIcon} title={m.wiki_tenancy_refused_title()}>
				<p>
					<InlineCode
						text={m.wiki_tenancy_refused({
							id: String(orderId),
							owner: owner ?? "",
							tenant,
						})}
					/>
				</p>
			</Callout>
		{:else}
			{#if leaks}
				<Callout
					tone="danger"
					icon={ShieldAlertIcon}
					title={m.wiki_tenancy_leak_title()}
					class="mb-3"
				>
					<p>
						{m.wiki_tenancy_leak({ tenant, orders: m.common_count_orders({ count: leaks }) })}
					</p>
				</Callout>
			{/if}
			<Table.Root>
				<Table.Caption class="mt-2 text-xs">
					{m.wiki_tenancy_gets({ tenant, orders: m.common_count_orders({ count: rows.length }) })}
				</Table.Caption>
				<Table.Header>
					<Table.Row>
						<Table.Head>id</Table.Head>
						<Table.Head class="hidden @md:table-cell">{m.client_column_number()}</Table.Head>
						<Table.Head>{m.orders_column_customer()}</Table.Head>
						<Table.Head>{m.wiki_tenancy_column_tenant()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as order (order.id)}
						{@const leaked = order.organization !== tenant}
						<Table.Row data-leak={leaked || undefined} class={leaked ? "bg-destructive/5" : ""}>
							<Table.Cell class="font-mono">{order.id}</Table.Cell>
							<Table.Cell class="hidden font-mono text-xs @md:table-cell">{order.number}</Table.Cell
							>
							<Table.Cell>{order.customer}</Table.Cell>
							<Table.Cell>
								<Badge variant={leaked ? "danger" : "neutral"}>{order.organization}</Badge>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</div>
</figure>
