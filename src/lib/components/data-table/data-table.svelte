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
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Attachment } from "svelte/attachments";
	import { SvelteMap } from "svelte/reactivity";

	import { formatNumber } from "#lib/format.js";
	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	import { SELECT_COLUMN } from "./default-pinning.js";
	import { columnLabel } from "./features.js";
	import { groupExpansion } from "./group-expansion.svelte.js";
	import { groupKey, type PageGroup, pageGroups, type PageGroups, sumOf } from "./grouping.js";
	import { createRowNavigation } from "./row-navigation.svelte.js";
	import { useTableContext } from "./table.svelte.js";

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
	const grouped = $derived.by(() => {
		const id = table.atoms.grouping.get()[0];
		const column = id === undefined ? undefined : table.getColumn(id);
		if (!column) return undefined;
		const rows = table.getRowModel().rows;
		const keyOf = (row: Row) => groupKey(row.getGroupingValue(column.id));
		if (groups) {
			// The rows around the page are plain data, which only the column can tell the value of.
			const { getGroupingValue } = column.columnDef;
			const keyOfData = (data: unknown) =>
				groupKey(
					getGroupingValue
						? getGroupingValue(data as never, -1, undefined as never)
						: column.accessorFn?.(data as never, -1),
				);
			return {
				column,
				groups: pageGroups(rows, keyOf, {
					counts: groups.counts,
					previous: groups.previous === undefined ? undefined : keyOfData(groups.previous),
					next: groups.next === undefined ? undefined : keyOfData(groups.next),
				}),
				sums: () => [],
			};
		}
		// All the rows (filtered and sorted, before paging) are here.
		const all = table.getPrePaginatedRowModel().rows;
		const byKey = new Map<string, Row[]>();
		for (const row of all) {
			const key = keyOf(row);
			const group = byKey.get(key);
			if (group) group.push(row);
			else byKey.set(key, [row]);
		}
		const { pageIndex, pageSize } = table.atoms.pagination.get();
		const start = pageIndex * pageSize;
		const before = all[start - 1];
		const after = all[start + rows.length];
		const summed = columns.filter((other) => other.columnDef.meta?.groupSum);
		return {
			column,
			groups: pageGroups(rows, keyOf, {
				counts: Object.fromEntries([...byKey].map(([key, rows]) => [key, rows.length])),
				previous: before && keyOf(before),
				next: after && keyOf(after),
			}),
			/** The sums of the `groupSum` columns over a group's rows. */
			sums: (key: string) =>
				summed.map((other) => ({
					id: other.id,
					text: m.common_table_group_sum({
						label: columnLabel(other),
						sum: other.columnDef.meta!.groupSum!(
							sumOf(byKey.get(key) ?? [], (row) => row.getValue(other.id)),
						),
					}),
				})),
		};
	});

	/** A group's header row's id, for the keyboard navigation. */
	const groupRowId = (key: string) => `group:${key}`;

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

	/** Whether there's more to scroll to sideways, under the pinned columns. */
	let overflow = $state({ start: false, end: false });

	const trackOverflow: Attachment<HTMLElement> = (root) => {
		const area = root.querySelector<HTMLElement>('[data-slot="table-container"]');
		if (!area) return;
		const update = () => {
			// Negative in right-to-left layouts.
			const scrolled = Math.abs(area.scrollLeft);
			overflow = {
				start: scrolled > 0,
				end: scrolled < area.scrollWidth - area.clientWidth - 1,
			};
		};
		update();
		area.addEventListener("scroll", update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(area);
		if (area.firstElementChild) observer.observe(area.firstElementChild);
		return () => {
			area.removeEventListener("scroll", update);
			observer.disconnect();
		};
	};

	/** The rendered widths of the pinned columns, from their headers, to offset the next ones. */
	const widths = new SvelteMap<string, number>();

	// One attachment per column, so re-rendering a header doesn't re-attach it.
	const measurers = new Map<string, Attachment<HTMLElement>>();

	function measure(id: string) {
		let measurer = measurers.get(id);
		if (!measurer) {
			measurer = (element) => {
				const update = () => {
					const width = element.getBoundingClientRect().width;
					if (widths.get(id) !== width) widths.set(id, width);
				};
				update();
				const observer = new ResizeObserver(update);
				observer.observe(element);
				return () => observer.disconnect();
			};
			measurers.set(id, measurer);
		}
		return measurer;
	}

	interface Pin {
		side: "start" | "end";
		/** The distance from its side: the widths of the pinned columns before it. */
		offset: number;
		/** The innermost pinned column on its side, which casts the shadow. */
		edge: boolean;
		/** The outermost pinned column on its side, at the edge of the scroll area. */
		outer: boolean;
	}

	const pins = $derived.by(() => {
		const result = new Map<string, Pin>();
		const place = (side: Pin["side"], columns: { id: string }[]) => {
			let offset = 0;
			columns.forEach((column, index) => {
				result.set(column.id, {
					side,
					offset,
					edge: index === columns.length - 1,
					outer: index === 0,
				});
				offset += widths.get(column.id) ?? 0;
			});
		};
		const shown = (column: { getIsGrouped(): boolean }) => !column.getIsGrouped();
		place("start", table.getStartVisibleLeafColumns().filter(shown));
		place("end", table.getEndVisibleLeafColumns().filter(shown).toReversed());
		return result;
	});

	// Sticky cells are opaque: the table's surface (`--data-table-surface`, the background behind
	// the table) under the row's own background, which they inherit, and which `::before` paints
	// again on top of that surface. That keeps hover, selection and theme colours intact. A theme
	// that gives the table a background of its own sets the surface to match, e.g.
	// `[--data-table-surface:var(--card)]` on `data-table`.
	const opaque =
		"bg-inherit bg-[linear-gradient(var(--data-table-surface),var(--data-table-surface))] before:absolute before:inset-0 before:-z-10 before:bg-inherit";

	// Below `sm` nothing is pinned: on a phone the pinned columns would leave too little room for
	// the rest, so the whole row scrolls.
	const side = {
		start: "sm:sticky sm:start-(--pin-offset)",
		end: "sm:sticky sm:end-(--pin-offset)",
	};

	const shadow = {
		start:
			"after:start-full after:border-s after:bg-linear-to-r sm:group-data-[overflow-start]/data-table:after:opacity-100",
		end: "after:end-full after:border-e after:bg-linear-to-l sm:group-data-[overflow-end]/data-table:after:opacity-100",
	};

	// Compact rows (see `density.svelte.ts`): less padding in the cells and a lower header. The scroll
	// area keeps a header's height clear at the top for rows scrolled into view (see
	// `row-navigation.svelte.ts`).
	const compact = {
		head: "in-data-[table-density=compact]:h-8",
		cell: "in-data-[table-density=compact]:py-1",
		area: "*:data-[slot=table-container]:scroll-pt-10 in-data-[table-density=compact]:*:data-[slot=table-container]:scroll-pt-8",
	};

	// A focused row (see `row-navigation.svelte.ts`) has a ring drawn over its cells, pinned ones
	// included, and under the sticky header (the row itself would paint its outline under them).
	// While the row is scrolled sideways, its ends are out of view: the outermost pinned cells, at
	// the scroll area's edges, draw the ring's sides there.
	const focusRing =
		"group/row relative outline-none after:pointer-events-none after:absolute after:inset-0 after:z-15 after:hidden after:ring-2 after:ring-ring after:ring-inset focus-visible:after:block";
	const focusEdge = {
		start:
			"group-focus-visible/row:before:shadow-[inset_2px_0_var(--color-ring)] rtl:group-focus-visible/row:before:shadow-[inset_-2px_0_var(--color-ring)]",
		end: "group-focus-visible/row:before:shadow-[inset_-2px_0_var(--color-ring)] rtl:group-focus-visible/row:before:shadow-[inset_2px_0_var(--color-ring)]",
	};

	/** Attributes and classes for a pinned column's cells (none for other columns). */
	function pinned(id: string): { "data-pinned"?: Pin["side"]; style?: string; class?: string } {
		const pin = pins.get(id);
		if (!pin) return {};
		return {
			"data-pinned": pin.side,
			style: `--pin-offset: ${pin.offset}px`,
			class: cn(
				side[pin.side],
				pin.outer && focusEdge[pin.side],
				pin.edge && [
					"after:pointer-events-none after:absolute after:inset-y-0 after:w-3 after:border-border after:from-black/8 after:to-transparent after:opacity-0 after:transition-opacity dark:after:from-black/40",
					shadow[pin.side],
				],
			),
		};
	}
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
	{@attach trackOverflow}
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
					{@render groupRow(grouped.column.id, group, index, grouped.sums(group.key))}
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

<!--
	A group's header row: a checkbox for its rows in the selection column, and across the others
	its toggle, value, count and sums, which stay in view while the row scrolls sideways.
-->
{#snippet groupRow(
	columnId: string,
	group: PageGroup<Row>,
	index: number,
	sums: { id: string; text: string }[],
)}
	{@const id = groupRowId(group.key)}
	{@const labelId = `${hintId}-group-${index}`}
	{@const collapsed = expansion.isCollapsed(columnId, group.key)}
	{@const valueCell = group.rows[0].getAllCells().find((cell) => cell.column.id === columnId)}
	{@const groupLabel = valueCell?.column.columnDef.meta?.groupLabel}
	<Table.Row
		data-row-id={id}
		data-group={group.key}
		data-collapsed={collapsed || undefined}
		tabindex={navigation.tabIndex(id)}
		class={cn(focusRing, "bg-muted/50 hover:bg-muted/70")}
	>
		{#if selectColumn}
			{@const pin = pinned(selectColumn.id)}
			{@const selectable = group.rows.filter((row) => row.getCanSelect())}
			{@const selected = selectable.filter((row) => row.getIsSelected()).length}
			<Table.Cell
				data-pinned={pin["data-pinned"]}
				style={pin.style}
				class={cn(compact.cell, pin["data-pinned"] && ["relative z-10", opaque], pin.class)}
			>
				<Checkbox
					checked={selectable.length > 0 && selected === selectable.length}
					indeterminate={selected > 0 && selected < selectable.length}
					disabled={!selectable.length}
					onCheckedChange={(value) => selectable.forEach((row) => row.toggleSelected(value))}
					aria-label={m.common_table_select_group()}
				/>
			</Table.Cell>
		{/if}
		<Table.Cell
			colspan={columns.length - (selectColumn ? 1 : 0)}
			class={cn(compact.cell, "py-1.5")}
			style={`--group-offset: ${selectColumn && pins.has(selectColumn.id) ? (widths.get(selectColumn.id) ?? 0) : 0}px`}
		>
			<div
				class="flex w-fit flex-wrap items-center gap-x-2 gap-y-1 sm:sticky sm:start-(--group-offset)"
			>
				<Button
					variant="ghost"
					size="icon-sm"
					class="-my-1"
					data-group-toggle
					aria-expanded={!collapsed}
					aria-labelledby={labelId}
					onclick={() => expansion.toggle(columnId, group.key)}
				>
					<ChevronRightIcon
						class={cn(
							"transition-transform rtl:rotate-180",
							!collapsed && "rotate-90 rtl:rotate-90",
						)}
					/>
				</Button>
				<span id={labelId} class="font-medium">
					{#if groupLabel}
						{groupLabel(group.rows[0].getGroupingValue(columnId))}
					{:else if valueCell}
						<table.AppCell cell={valueCell}>
							{#snippet children(c)}
								<!-- Not `cell={c}`, which renders nothing for a grouped column's cell. -->
								<!-- (`content` takes a header's template too, which TypeScript can't match.) -->
								<c.FlexRender content={c.column.columnDef.cell as never} context={c.getContext()} />
							{/snippet}
						</table.AppCell>
					{/if}
				</span>
				<Badge data-group-count variant="secondary" class="tabular-nums" aria-hidden="true">
					{formatNumber(group.count)}
				</Badge>
				<span class="sr-only">{m.common_table_group_rows({ count: group.count })}</span>
				{#each sums as sum (sum.id)}
					<span class="text-sm text-muted-foreground tabular-nums">{sum.text}</span>
				{/each}
				{#if group.continued}
					<span data-group-note class="text-xs text-muted-foreground">
						{m.common_table_group_continued()}
					</span>
				{/if}
				{#if group.continues}
					<span data-group-note class="text-xs text-muted-foreground">
						{m.common_table_group_continues()}
					</span>
				{/if}
			</div>
		</Table.Cell>
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
