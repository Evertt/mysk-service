<!--
	@component
	The table itself: headers, the current page of rows, and an empty state.

	The header row sticks to the top of the table's scroll area, and pinned columns (see
	`default-pinning.ts`) stick to its sides, with a shadow while there's more to scroll to. With
	`fillViewport` (list pages), the page fits the viewport on larger screens and the rows scroll
	inside the table, so the toolbar and pagination stay in view; on small or low screens the page
	scrolls as usual.

	The rows can be navigated with the keyboard (see `row-navigation.svelte.ts`), and are spaced as
	the chosen density says (see `density.svelte.ts`).

	While `loading` (a server-side table fetching another page, filter, sort or search), the rows
	shown so far stay, dimmed, under a thin progress bar, and the table is `aria-busy`.

	When grouped (see `grouping.ts`), each group of the page's rows follows a header row with the
	group's value (its first row's cell of the grouped column, which the rows then leave out), how
	many rows it has in all, the sums of `meta.groupSum` columns, and whether it goes on from or
	onto another page. A server-side table passes what its server knows of the groups as `groups`.
	Groups collapse and expand (see `group-expansion.svelte.ts`), and their header rows take part in
	the keyboard navigation.
-->
<script lang="ts">
	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	import { SELECT_COLUMN } from "./default-pinning.ts";
	import { groupExpansion } from "./group-expansion.svelte.ts";
	import GroupRow from "./group-row.svelte";
	import { groupedPage, groupRowId, type PageGroups } from "./grouping.ts";
	import { createPinning } from "./pinning.svelte.ts";
	import { createRowNavigation } from "./row-navigation.svelte.ts";
	import { compact, focusRing, opaque } from "./table-classes.ts";
	import { useTableContext } from "./table.svelte.ts";
	import { trackOverflow } from "./track-overflow.ts";

	let {
		emptyTitle = m.common_table_empty_title(),
		emptyDescription = m.common_table_empty_description(),
		fillViewport = false,
		loading = false,
		groups,
	}: {
		emptyTitle?: string;
		emptyDescription?: string;
		/**
		 * Fit the page to the viewport (on screens big enough for it), scrolling the rows inside the
		 * table: for a list page whose table is the last thing on it.
		 */
		fillViewport?: boolean;
		/** Rows for another state are on their way: dims the ones shown. */
		loading?: boolean;
		/**
		 * What the server knows of the page's groups, for a server-side table when grouped (else
		 * the groups are what the table's own rows say).
		 */
		groups?: PageGroups;
	} = $props();

	const table = useTableContext();
	const theme = useTheme();
	const hintId = $props.id();

	type Row = ReturnType<typeof table.getRowModel>["rows"][number];

	/** The visible columns, but the one the rows are grouped by, which the group rows show. */
	const columns = $derived(
		table.getVisibleLeafColumns().filter((column) => !column.getIsGrouped()),
	);

	const expansion = groupExpansion(table);

	/** When grouped: the column, and the page's rows in their groups (see `grouping.ts`). */
	const grouped = $derived(groupedPage(table, groups));

	const navigation = createRowNavigation(table, {
		rowIds: () =>
			grouped
				? grouped.groups.flatMap((group) => [
						groupRowId(group.key),
						...(expansion.isCollapsed(grouped.column.id, group.key)
							? []
							: group.rows.map((row) => row.id)),
					])
				: table.getRowModel().rows.map((row) => row.id),
	});

	/** The selection column, when shown first (group rows have a checkbox in it). */
	const selectColumn = $derived(columns[0]?.id === SELECT_COLUMN ? columns[0] : undefined);

	const pinning = createPinning(table);
	const { pinned, measure } = pinning;

	/** Whether there's more to scroll to sideways, under the pinned columns. */
	let overflow = $state({ start: false, end: false });

	const overflowTracker = trackOverflow((value) => (overflow = value));
</script>

<div
	data-slot="data-table"
	data-fill-viewport={fillViewport || undefined}
	data-overflow-start={overflow.start || undefined}
	data-overflow-end={overflow.end || undefined}
	data-loading={loading || undefined}
	aria-busy={loading || undefined}
	class={cn(
		"group/data-table relative flex min-h-0 flex-col overflow-hidden rounded-lg border [--data-table-surface:var(--background)]",
		"*:data-[slot=table-container]:min-h-0 *:data-[slot=table-container]:overflow-auto",
		compact.area,
		fillViewport && "desktop:min-h-48",
		theme.classes("data-table"),
	)}
	{@attach overflowTracker}
>
	{#if loading}
		<div
			role="progressbar"
			aria-label={m.common_table_loading()}
			class="absolute inset-x-0 top-0 z-40 h-0.5 animate-pulse bg-primary/60"
		></div>
	{/if}
	<span id={hintId} class="sr-only">
		{m.common_table_keyboard_hint()}
		{#if grouped}{m.common_table_keyboard_hint_groups()}{/if}
	</span>
	<Table.Root aria-describedby={hintId}>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<!-- The header cells inherit the header's background (see `opaque`) through the row. -->
				<Table.Row class="bg-inherit hover:bg-inherit">
					{#each headerGroup.headers.filter((header) => !header.column.getIsGrouped()) as header (header.id)}
						{@const pin = pinned(header.column.id)}
						<table.AppHeader {header}>
							{#snippet children(h)}
								<Table.Head
									data-pinned={pin["data-pinned"]}
									style={pin.style}
									class={cn(
										"sticky top-0 z-20",
										compact.head,
										opaque,
										pin.class,
										pin["data-pinned"] && "z-30",
										h.column.id === "select" && "w-10",
									)}
									{@attach pin["data-pinned"] && measure(h.column.id)}
								>
									{#if !h.isPlaceholder}
										<h.FlexRender header={h} />
									{/if}
								</Table.Head>
							{/snippet}
						</table.AppHeader>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<!-- Dimmed while loading, after a moment (so a quick answer doesn't flicker); back at once. -->
		<Table.Body
			{...navigation.body}
			class={cn("transition-opacity", loading && "opacity-50 delay-150")}
		>
			<!-- Rows are keyed by the row itself, not its id: Svelte doesn't update a kept item, and when
			     the data changes (e.g. a bulk action's refresh) a row with the same id is a new row object
			     with the new values. Sorting, filtering and paging keep the row objects. -->
			{#if grouped}
				{#each grouped.groups as group, index (group.key)}
					<GroupRow
						columnId={grouped.column.id}
						{group}
						sums={grouped.sums(group.key)}
						labelId="{hintId}-group-{index}"
						columnCount={columns.length}
						{selectColumn}
						{navigation}
						{pinning}
					/>
					{#if !expansion.isCollapsed(grouped.column.id, group.key)}
						{#each group.rows as row (row)}
							{@render dataRow(row)}
						{/each}
					{/if}
				{:else}
					{@render empty()}
				{/each}
			{:else}
				{#each table.getRowModel().rows as row (row)}
					{@render dataRow(row)}
				{:else}
					{@render empty()}
				{/each}
			{/if}
		</Table.Body>
	</Table.Root>
</div>

{#snippet dataRow(row: Row)}
	<Table.Row
		data-state={row.getIsSelected() ? "selected" : undefined}
		data-row-id={row.id}
		tabindex={navigation.tabIndex(row.id)}
		class={focusRing}
	>
		{#each row.getVisibleCells().filter((cell) => !cell.column.getIsGrouped()) as cell (cell.id)}
			{@const pin = pinned(cell.column.id)}
			<table.AppCell {cell}>
				{#snippet children(c)}
					<Table.Cell
						data-pinned={pin["data-pinned"]}
						style={pin.style}
						class={cn(compact.cell, pin["data-pinned"] && ["relative z-10", opaque], pin.class)}
					>
						<c.FlexRender cell={c} />
					</Table.Cell>
				{/snippet}
			</table.AppCell>
		{/each}
	</Table.Row>
{/snippet}

{#snippet empty()}
	<Table.Row>
		<Table.Cell colspan={columns.length}>
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>{emptyTitle}</Empty.Title>
					<Empty.Description>{emptyDescription}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</Table.Cell>
	</Table.Row>
{/snippet}
