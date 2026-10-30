<!--
	@component
	A miniature of the lists, over 25 made-up orders: search (each word in one of the columns, as
	every list does it), a status filter and grouping by status. Simplified: the real table
	(`createClientTable()` and `<ListLayout>`) keeps its state in the URL and offers the signed-in
	user's saved views, which a public page has no business with, so this one is drawn with the
	table parts and shares only the search rule and the order statuses.
-->
<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/format.ts";
	import { orderStatuses } from "#lib/models.ts";
	import { orderStatusDisplay } from "#lib/orders/display.ts";

	import { fixtureRows, playground, type PlaygroundState } from "./list-playground.ts";

	const id = $props.id();

	let search = $state("");
	let status = $state<string>("");
	let grouped = $state(false);

	const current = $derived<PlaygroundState>({
		search,
		status: orderStatuses.find((candidate) => candidate === status),
		grouped,
	});
	const shown = $derived(playground(fixtureRows, current));
	const filtered = $derived(search.trim() !== "" || status !== "");
</script>

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="flex flex-col gap-3 @xl:flex-row @xl:flex-wrap @xl:items-end @xl:gap-x-4">
		<div class="grid gap-1.5 @xl:w-56">
			<Label for="{id}-search" class="text-xs text-muted-foreground">Search</Label>
			<InputGroup.Root>
				<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
				<InputGroup.Input id="{id}-search" placeholder="Try “harbour 1”…" bind:value={search} />
			</InputGroup.Root>
		</div>
		<div class="grid gap-1.5">
			<Label for="{id}-status" class="text-xs text-muted-foreground">Status</Label>
			<NativeSelect.Root id="{id}-status" bind:value={status} size="sm">
				<NativeSelect.Option value="">All statuses</NativeSelect.Option>
				{#each orderStatuses as option (option)}
					<NativeSelect.Option value={option}
						>{orderStatusDisplay[option].label}</NativeSelect.Option
					>
				{/each}
			</NativeSelect.Root>
		</div>
		<div class="flex items-center gap-2 @xl:h-8">
			<Switch id="{id}-group" bind:checked={grouped} />
			<Label for="{id}-group">Group by status</Label>
		</div>
		{#if filtered}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => {
					search = "";
					status = "";
				}}
			>
				Reset
			</Button>
		{/if}
	</div>

	<div class="mt-4" aria-live="polite">
		<Table.Root>
			<Table.Caption class="mt-2 text-xs">
				{shown.total} of {fixtureRows.length} orders
				<span class="text-muted-foreground">(simplified: no URL state, no saved views)</span>
			</Table.Caption>
			<Table.Header>
				<Table.Row>
					<Table.Head>Order</Table.Head>
					<Table.Head>Customer</Table.Head>
					<Table.Head class="hidden @md:table-cell">Site</Table.Head>
					<!-- Grouped, the group's header says it: as the real table leaves the grouped column out. -->
					{#if !grouped}
						<Table.Head>Status</Table.Head>
					{/if}
					<Table.Head class="hidden text-right @md:table-cell">Scheduled</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each shown.groups as group (group.status ?? "all")}
					{#if group.status}
						<Table.Row class="bg-muted/50 hover:bg-muted/50" data-group={group.status}>
							<Table.Cell colspan={5}>
								<span class="flex items-center gap-2 font-medium">
									<EnumBadge display={orderStatusDisplay} value={group.status} />
									<span class="text-xs text-muted-foreground">{group.rows.length}</span>
								</span>
							</Table.Cell>
						</Table.Row>
					{/if}
					{#each group.rows as row (row.id)}
						<Table.Row data-row={row.id}>
							<Table.Cell class="font-mono text-xs">{row.number}</Table.Cell>
							<Table.Cell>{row.customer}</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground @md:table-cell">{row.site}</Table.Cell
							>
							{#if !group.status}
								<Table.Cell>
									<EnumBadge display={orderStatusDisplay} value={row.status} />
								</Table.Cell>
							{/if}
							<Table.Cell class="hidden text-right tabular-nums @md:table-cell">
								{row.scheduledFor ? formatDate(Temporal.PlainDate.from(row.scheduledFor)) : ""}
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell colspan={5} class="py-8 text-center text-muted-foreground">
							No orders match.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</figure>
