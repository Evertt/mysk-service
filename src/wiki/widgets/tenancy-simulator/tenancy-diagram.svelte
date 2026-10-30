<!--
	@component
	The shared `order` table as the tenancy simulator's query reaches it: each tenant's rows on a
	line of their own, those it reads lit (`data-reached`), another tenant's it reads marked as a
	leak, and the one a scoped lookup by id refused outlined.
-->
<script lang="ts">
	import { cn } from "#lib/utils.ts";
	import Diagram from "#wiki/parts/diagram.svelte";

	import { type FixtureOrder, fixtureOrders } from "./tenancy.ts";

	let {
		tenant,
		rows,
		refusedId,
	}: {
		tenant: FixtureOrder["organization"];
		/** What the query read; none when it was refused. */
		rows: readonly FixtureOrder[];
		/** The id a scoped lookup refused. */
		refusedId?: number;
	} = $props();

	const tenants = ["North", "South"] as const;
	const cell = { width: 76, height: 44, gap: 10, left: 76 };
	const lane = (index: number) => 14 + index * (cell.height + 18);
	const width = cell.left + 3 * cell.width + 2 * cell.gap;
	const height = lane(2) - 4;

	const look = (order: FixtureOrder) =>
		rows.includes(order)
			? order.organization === tenant
				? "read"
				: "leak"
			: order.id === refusedId
				? "refused"
				: "untouched";

	const box = {
		read: "fill-primary/15 stroke-primary",
		leak: "fill-destructive/15 stroke-destructive",
		refused: "fill-transparent stroke-destructive",
		untouched: "fill-muted stroke-border",
	};
	const text = {
		read: "fill-foreground",
		leak: "fill-destructive",
		refused: "fill-destructive",
		untouched: "fill-muted-foreground",
	};
</script>

<div class="mx-auto w-full max-w-[24rem] [&>svg]:my-0">
	<Diagram
		viewBox="0 0 {width} {height}"
		label="The order table both tenants share, and the rows {tenant}'s query reads of it."
	>
		{#each tenants as organization, index (organization)}
			<text
				x="0"
				y={lane(index) + cell.height / 2}
				dominant-baseline="central"
				font-size="14"
				font-weight={organization === tenant ? 600 : 400}
				class={organization === tenant ? "fill-foreground" : "fill-muted-foreground"}
			>
				{organization}
			</text>
			{#each fixtureOrders.filter((order) => order.organization === organization) as order, column (order.id)}
				{@const state = look(order)}
				{@const x = cell.left + column * (cell.width + cell.gap)}
				<g data-order={order.id} data-reached={state === "read" || state === "leak" || undefined}>
					<rect
						{x}
						y={lane(index)}
						width={cell.width}
						height={cell.height}
						rx="8"
						stroke-width={state === "untouched" ? 1 : 2}
						stroke-dasharray={state === "refused" ? "5 4" : undefined}
						class={cn("motion-safe:transition-colors", box[state])}
					/>
					<text
						x={x + cell.width / 2}
						y={lane(index) + cell.height / 2}
						text-anchor="middle"
						dominant-baseline="central"
						font-size="14"
						font-weight={state === "untouched" ? 400 : 600}
						class={text[state]}
					>
						{state === "refused" ? "404" : `id ${order.id}`}
					</text>
				</g>
			{/each}
		{/each}
	</Diagram>
</div>
