<!--
	@component
	A site's page, in the office and in the customer portal: what needs attention there (its chips),
	a link to its report, its open work (orders still to be done, also reports awaiting acceptance)
	and its units. The shells link them their own way: `orderLink` renders an order's number as a
	link (the office's `OrderLink`, the portal's page), `unitHref` makes each unit's row a link (the
	portal) or `unitTitle` links its title (the office's `EquipmentLink`).
-->
<script lang="ts">
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import type { ComponentProps, Snippet } from "svelte";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { UnitRow } from "#lib/equipment/components.ts";
	import { formatDate, formatDateTime } from "#lib/i18n/index.ts";
	import type { OrderStatus, OrderType } from "#lib/models.ts";
	import { TypeLabel } from "#lib/orders/components.ts";
	import { orderStatusDisplay } from "#lib/orders/index.ts";

	import type { SiteFigure } from "../extensions.ts";
	import SiteChips from "./site-chips.svelte";

	type Unit = ComponentProps<typeof UnitRow>["unit"] & {
		id: number;
		category: string;
		location: string | null;
	};

	interface Order {
		id: number;
		number: string;
		type: OrderType;
		status: OrderStatus;
		description: string;
		createdAt: Temporal.Instant;
		scheduledFor: Temporal.Instant | null;
	}

	let {
		figures,
		units,
		open,
		reportHref,
		orderLink,
		unitHref,
		unitTitle,
	}: {
		figures: readonly SiteFigure[];
		units: readonly Unit[];
		open: readonly Order[];
		reportHref: string;
		orderLink: Snippet<[{ number: string }]>;
		unitHref?: (unit: Unit) => string;
		unitTitle?: Snippet<[Unit]>;
	} = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<SiteChips {figures}>
		{#snippet empty()}
			<Badge variant="success">{m.customers_overview_fine()}</Badge>
		{/snippet}
	</SiteChips>
	<Button href={reportHref} data-site-report>
		<FileTextIcon data-icon="inline-start" />
		{m.customers_report_title()}
	</Button>
</div>

<Card.Root data-site-open-work>
	<Card.Header>
		<Card.Title>{m.customers_site_page_open_work()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if open.length}
			<ul class="flex flex-col divide-y">
				{#each open as order (order.id)}
					<li class="flex flex-col gap-1 py-3 text-sm" data-order={order.number}>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
							{@render orderLink(order)}
							<TypeLabel type={order.type} />
							<EnumBadge display={orderStatusDisplay} value={order.status} />
						</div>
						<p class="line-clamp-2 text-muted-foreground">{order.description}</p>
						<p class="text-xs text-muted-foreground tabular-nums">
							{order.scheduledFor
								? formatDateTime(order.scheduledFor)
								: formatDate(order.createdAt)}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="flex items-center gap-2 text-sm text-muted-foreground">
				<ClipboardCheckIcon class="size-4" />
				{m.customers_site_page_no_open_work()}
			</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root data-site-units>
	<Card.Header>
		<Card.Title>{m.customers_site_page_units()}</Card.Title>
		<Card.Description>{m.common_count_units({ count: units.length })}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if units.length}
			<div class="flex flex-col divide-y">
				{#each units as unit (unit.id)}
					{#if unitTitle}
						<UnitRow {unit} extras={{ category: unit.category, location: unit.location }}>
							{#snippet title()}{@render unitTitle(unit)}{/snippet}
						</UnitRow>
					{:else}
						<UnitRow
							{unit}
							href={unitHref?.(unit)}
							extras={{ category: unit.category, location: unit.location }}
						/>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.customers_site_page_no_units()}</p>
		{/if}
	</Card.Content>
</Card.Root>
