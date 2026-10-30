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
			<span class="text-xs font-medium text-muted-foreground">Signed in to</span>
			<FilterChips
				label="Signed in to"
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
			<Label for="{id}-order" class="text-xs text-muted-foreground">Reading</Label>
			<NativeSelect.Root id="{id}-order" bind:value={asked} size="sm">
				<NativeSelect.Option value="">every order</NativeSelect.Option>
				{#each fixtureOrders as order (order.id)}
					<NativeSelect.Option value={String(order.id)}>
						the order with id {order.id} ({order.organization}'s)
					</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>
		<div class="flex items-center gap-2 @xl:h-8">
			<Switch id="{id}-scoped" bind:checked={scoped} />
			<Label for="{id}-scoped">Scoped with <code class="font-mono">inTenant()</code></Label>
		</div>
	</div>

	<div class="mt-4 grid gap-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @xl:items-center">
		<pre
			class="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground"
			aria-label="The query"><code>{answer.sql}</code></pre>
		<TenancyDiagram {tenant} {rows} refusedId={"refused" in answer ? orderId : undefined} />
	</div>

	<div class="mt-4" aria-live="polite">
		{#if "refused" in answer}
			<Callout tone="success" icon={ShieldCheckIcon} title="404 Not found">
				<p>
					Order {orderId} is {owner}'s, so for {tenant} it doesn't exist:
					<code class="font-mono">idInTenant()</code> found nothing, and the page answers as for an id
					no one has.
				</p>
			</Callout>
		{:else}
			{#if leaks}
				<Callout tone="danger" icon={ShieldAlertIcon} title="A leak" class="mb-3">
					<p>
						{tenant} reads {leaks === 1 ? "an order" : `${leaks} orders`} of another tenant's. Ids are
						global; only the scope keeps a tenant to its own rows.
					</p>
				</Callout>
			{/if}
			<Table.Root>
				<Table.Caption class="mt-2 text-xs">
					What {tenant} gets: {rows.length}
					{rows.length === 1 ? "order" : "orders"}
				</Table.Caption>
				<Table.Header>
					<Table.Row>
						<Table.Head>id</Table.Head>
						<Table.Head class="hidden @md:table-cell">Number</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Tenant</Table.Head>
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
