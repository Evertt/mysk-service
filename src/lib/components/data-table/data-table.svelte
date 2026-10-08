<!--
	@component
	The table itself: headers, the current page of rows, and an empty state.

	The header row sticks to the top of the table's scroll area, and pinned columns (see
	`default-pinning.ts`) stick to its sides, with a shadow while there's more to scroll to. With
	`fillViewport` (list pages), the page fits the viewport on larger screens and the rows scroll
	inside the table, so the toolbar and pagination stay in view; on small or low screens the page
	scrolls as usual.
-->
<script lang="ts">
	import type { Attachment } from "svelte/attachments";
	import { SvelteMap } from "svelte/reactivity";

	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	import { useTableContext } from "./table.svelte.js";

	let {
		emptyTitle = m.common_table_empty_title(),
		emptyDescription = m.common_table_empty_description(),
		fillViewport = false,
	}: {
		emptyTitle?: string;
		emptyDescription?: string;
		/**
		 * Fit the page to the viewport (on screens big enough for it), scrolling the rows inside the
		 * table: for a list page whose table is the last thing on it.
		 */
		fillViewport?: boolean;
	} = $props();

	const table = useTableContext();
	const theme = useTheme();

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
	}

	const pins = $derived.by(() => {
		const result = new Map<string, Pin>();
		const place = (side: Pin["side"], columns: { id: string }[]) => {
			let offset = 0;
			columns.forEach((column, index) => {
				result.set(column.id, { side, offset, edge: index === columns.length - 1 });
				offset += widths.get(column.id) ?? 0;
			});
		};
		place("start", table.getStartVisibleLeafColumns());
		place("end", table.getEndVisibleLeafColumns().toReversed());
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

	/** Attributes and classes for a pinned column's cells (none for other columns). */
	function pinned(id: string): { "data-pinned"?: Pin["side"]; style?: string; class?: string } {
		const pin = pins.get(id);
		if (!pin) return {};
		return {
			"data-pinned": pin.side,
			style: `--pin-offset: ${pin.offset}px`,
			class: cn(
				side[pin.side],
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
	class={cn(
		"group/data-table flex min-h-0 flex-col overflow-hidden rounded-lg border [--data-table-surface:var(--background)]",
		"*:data-[slot=table-container]:min-h-0 *:data-[slot=table-container]:overflow-auto",
		fillViewport && "desktop:min-h-48",
		theme.classes("data-table"),
	)}
	{@attach trackOverflow}
>
	<Table.Root>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<!-- The header cells inherit the header's background (see `opaque`) through the row. -->
				<Table.Row class="bg-inherit hover:bg-inherit">
					{#each headerGroup.headers as header (header.id)}
						{@const pin = pinned(header.column.id)}
						<table.AppHeader {header}>
							{#snippet children(h)}
								<Table.Head
									data-pinned={pin["data-pinned"]}
									style={pin.style}
									class={cn(
										"sticky top-0 z-20",
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
		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				<Table.Row data-state={row.getIsSelected() ? "selected" : undefined}>
					{#each row.getVisibleCells() as cell (cell.id)}
						{@const pin = pinned(cell.column.id)}
						<table.AppCell {cell}>
							{#snippet children(c)}
								<Table.Cell
									data-pinned={pin["data-pinned"]}
									style={pin.style}
									class={cn(pin["data-pinned"] && ["relative z-10", opaque], pin.class)}
								>
									<c.FlexRender cell={c} />
								</Table.Cell>
							{/snippet}
						</table.AppCell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={table.getVisibleLeafColumns().length}>
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>{emptyTitle}</Empty.Title>
								<Empty.Description>{emptyDescription}</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
