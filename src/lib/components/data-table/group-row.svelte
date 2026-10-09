<!--
	@component
	A group's header row (see `grouping.ts`): a checkbox for its rows in the selection column, and
	across the others its toggle, value, count and sums, which stay in view while the row scrolls
	sideways.
-->
<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import { columnLabel, type DataTableColumnMeta } from "./features.ts";
	import { groupExpansion } from "./group-expansion.svelte.ts";
	import { groupRowId, type PageGroup } from "./grouping.ts";
	import type { createPinning } from "./pinning.svelte.ts";
	import type { createRowNavigation } from "./row-navigation.svelte.ts";
	import { compact, focusRing, opaque } from "./table-classes.ts";
	import { useTableContext } from "./table.svelte.ts";

	const table = useTableContext();

	type Row = ReturnType<typeof table.getRowModel>["rows"][number];

	let {
		columnId,
		group,
		sums,
		labelId,
		columnCount,
		selectColumn,
		navigation,
		pinning,
	}: {
		/** The column the rows are grouped by. */
		columnId: string;
		group: PageGroup<Row>;
		/** The sums of the `groupSum` columns over the group's rows. */
		sums: { column: { id: string; columnDef: { meta?: DataTableColumnMeta } }; sum: number }[];
		/** The id of the element that names the group's toggle. */
		labelId: string;
		/** How many columns the table shows. */
		columnCount: number;
		/** The selection column, when shown first. */
		selectColumn?: { id: string };
		navigation: Pick<ReturnType<typeof createRowNavigation>, "tabIndex">;
		pinning: Pick<ReturnType<typeof createPinning>, "pinned" | "offsetOf">;
	} = $props();

	const expansion = groupExpansion(table);

	const id = $derived(groupRowId(group.key));
	const collapsed = $derived(expansion.isCollapsed(columnId, group.key));
	const valueCell = $derived(
		group.rows[0].getAllCells().find((cell) => cell.column.id === columnId),
	);
	const groupLabel = $derived(valueCell?.column.columnDef.meta?.groupLabel);
</script>

<Table.Row
	data-row-id={id}
	data-group={group.key}
	data-collapsed={collapsed || undefined}
	tabindex={navigation.tabIndex(id)}
	class={cn(focusRing, "bg-muted/50 hover:bg-muted/70")}
>
	{#if selectColumn}
		{@const pin = pinning.pinned(selectColumn.id)}
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
		colspan={columnCount - (selectColumn ? 1 : 0)}
		class={cn(compact.cell, "py-1.5")}
		style={`--group-offset: ${selectColumn ? pinning.offsetOf(selectColumn.id) : 0}px`}
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
					class={cn("transition-transform rtl:rotate-180", !collapsed && "rotate-90 rtl:rotate-90")}
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
			{#each sums as { column, sum } (column.id)}
				{@const text = m.common_table_group_sum({
					label: columnLabel(column),
					sum: column.columnDef.meta!.groupSum!(sum),
				})}
				<span class="text-sm text-muted-foreground tabular-nums">{text}</span>
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
