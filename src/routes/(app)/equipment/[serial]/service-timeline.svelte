<!--
	@component
	Everything that happened to a unit, newest first: its installation, every order on it with who
	did what, what it took and what it cost (with what the tenant's modules take off, e.g. the work a
	service contract includes), and the end of its warranty, which may be ahead.
-->
<script lang="ts">
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import ShieldOffIcon from "@lucide/svelte/icons/shield-off";

	import DetailItem from "#lib/components/detail-item.svelte";
	import EngineerLink from "#lib/engineers/engineer-link.svelte";
	import { formatCents, formatDate } from "#lib/format.js";
	import { formatQuantity } from "#lib/materials/display.js";
	import MaterialLink from "#lib/materials/material-link.svelte";
	import { types } from "#lib/orders/display.js";
	import OrderLink from "#lib/orders/order-link.svelte";
	import OrderStatusBadge from "#lib/orders/status-badge.svelte";

	import type { ServiceEvent } from "./service-history.js";
	import { getServiceHistory } from "./service-history.remote.js";

	let { serial }: { serial: string } = $props();

	const { events, stats } = $derived(await getServiceHistory(serial));

	const key = (event: ServiceEvent) =>
		event.kind === "order" ? `order-${event.order.id}` : event.kind;
	const icon = (event: ServiceEvent) =>
		event.kind === "order"
			? types[event.order.type].icon
			: event.kind === "installation"
				? PackageCheckIcon
				: event.upcoming
					? ShieldCheckIcon
					: ShieldOffIcon;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.equipment_history_title()}</Card.Title>
		<Card.Description>{m.equipment_history_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if !stats.orders}
			<Empty.Root class="border p-6">
				<Empty.Header>
					<Empty.Title>{m.equipment_history_empty_title()}</Empty.Title>
					<Empty.Description>{m.equipment_history_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		<ol aria-label={m.equipment_history_title()} class="flex flex-col">
			{#each events as event (key(event))}
				{@const Icon = icon(event)}
				<li data-event={event.kind} class="group relative flex gap-4 pb-6 last:pb-0">
					<!-- The line to the next event. -->
					<span
						aria-hidden="true"
						class="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border group-last:hidden"
					></span>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background"
					>
						<Icon class="size-4 text-muted-foreground" />
					</span>
					<div class="flex min-w-0 flex-1 flex-col gap-2 pt-1">
						<time
							datetime={event.date.toISOString()}
							class="text-xs text-muted-foreground tabular-nums"
						>
							{formatDate(event.date)}
						</time>
						{#if event.kind === "installation"}
							<p class="font-medium">{m.equipment_history_installed()}</p>
						{:else if event.kind === "warranty"}
							<p class="font-medium">
								{event.upcoming
									? m.equipment_history_warranty_ends()
									: m.equipment_history_warranty_ended()}
							</p>
						{:else}
							{@const order = event.order}
							{@const hours = m.common_count_hours_short({ count: order.laborHours })}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="font-medium">{types[order.type].label}</span>
								<OrderLink number={order.number} />
								<OrderStatusBadge status={order.status} />
								<span data-cost="total" class="ml-auto font-medium tabular-nums">
									{formatCents(order.cost.total)}
								</span>
							</div>
							<p class="text-sm text-muted-foreground">{order.description}</p>
							<dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
								<DetailItem label={m.equipment_history_engineer()}>
									{#if order.engineer}
										<EngineerLink id={order.engineer.id} name={order.engineer.name} />
									{:else}
										<span class="text-muted-foreground">{m.common_unassigned()}</span>
									{/if}
								</DetailItem>
								<DetailItem
									label={m.equipment_history_scheduled()}
									value={order.scheduledFor && formatDate(order.scheduledFor)}
								/>
								<DetailItem
									label={m.equipment_history_completed()}
									value={order.completedAt && formatDate(order.completedAt)}
								/>
								<DetailItem
									label={m.equipment_history_labour()}
									value="{hours} · {formatCents(order.cost.labor)}"
								/>
							</dl>
							{#if order.materials.length}
								<div class="flex flex-col gap-2">
									<p class="text-xs text-muted-foreground">
										{m.equipment_history_materials({ cost: formatCents(order.cost.materials) })}
									</p>
									<ul class="flex flex-col gap-2 text-sm">
										{#each order.materials as line (line.id)}
											<li class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-right tabular-nums">
													{formatQuantity(line.quantity, line.unit)}
												</span>
												<MaterialLink sku={line.sku} name={line.name} />
											</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if order.cost.adjustments.length}
								<ul
									aria-label={m.equipment_history_adjustments()}
									class="flex flex-col gap-2 text-sm"
								>
									{#each order.cost.adjustments as adjustment, i (i)}
										<li class="flex items-start gap-3">
											<div class="flex min-w-0 flex-1 flex-col">
												<span>{adjustment.label}</span>
												{#if adjustment.detail}
													<span class="text-xs text-muted-foreground">{adjustment.detail}</span>
												{/if}
											</div>
											<span data-cost="adjustment" class="tabular-nums">
												{formatCents(adjustment.amount)}
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
