<!--
	One of the customer's orders in the portal: what it's about and where it stands (reported, not
	accepted yet, accepted, planned for a day with the engineer's first name, done, or rejected with
	the planner's reason), its units, the tenant's modules' cards (`client.order`, e.g. its
	checklists' results and the work order to print) and, once done, the work order's sign-off. On
	a wide screen the details are beside the rest.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";

	import { order as orderParts } from "#lib/client/extensions.ts";
	import DetailItem from "#lib/components/detail-item.svelte";
	import { StatusBadge as UnitStatusBadge } from "#lib/equipment/components.ts";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatDate, formatDateTime, label } from "#lib/i18n/index.ts";
	import { SignOff } from "#lib/orders/components.ts";

	import ClientStatusBadge from "../../client-status-badge.svelte";
	import { clientStatus } from "../../client-status.ts";
	import { getPortalOrder, watchPortal } from "../../client.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalOrder(params.number));
	const order = $derived(data.order);
	const status = $derived(clientStatus(order.status, order.rejectionReason));
	// Just reported from the form.
	const reported = $derived(page.url.searchParams.has("reported"));

	refreshOnChange(watchPortal, () => getPortalOrder(params.number).refresh());
</script>

<svelte:head>
	<title>{order.number} · {m.client_title()}</title>
</svelte:head>

<div>
	<Button variant="ghost" size="sm" class="-ml-2" href={resolve("/(customer)/portal/orders")}>
		<ArrowLeftIcon data-icon="inline-start" />
		{m.client_nav_orders()}
	</Button>
</div>

{#if reported && status === "awaiting"}
	<div
		role="status"
		class="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
		data-reported
	>
		<CircleCheckIcon class="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
		<div class="flex flex-col gap-1">
			<p class="font-medium">{m.client_reported_title()}</p>
			<p class="text-muted-foreground">{m.client_reported_description()}</p>
		</div>
	</div>
{/if}

<header class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">
			{label("orderType", order.type)}
			<span class="text-muted-foreground tabular-nums">{order.number}</span>
		</h1>
		<ClientStatusBadge status={order.status} rejectionReason={order.rejectionReason} />
	</div>
	<p class="whitespace-pre-line">{order.description}</p>
</header>

{#if status === "rejected"}
	<div
		class="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
		data-rejection
	>
		<p class="font-medium text-destructive">{m.client_rejected_title()}</p>
		<p class="whitespace-pre-line">{order.rejectionReason}</p>
	</div>
{/if}

<!-- On a wide screen its details beside the rest. -->
<div
	class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
>
	<Card.Root class="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1" data-order-details>
		<Card.Content>
			<dl class="grid grid-cols-2 gap-4">
				{#if order.reportedBy}
					<DetailItem label={m.client_detail_reported()} value={formatDate(order.createdAt)} />
					<DetailItem label={m.client_detail_reported_by()} value={order.reportedBy} />
				{:else}
					<DetailItem label={m.client_detail_created()} value={formatDate(order.createdAt)} />
				{/if}
				<DetailItem
					label={m.client_detail_priority()}
					value={label("orderPriority", order.priority)}
				/>
				{#if order.decidedAt && status !== "rejected"}
					<DetailItem label={m.client_detail_accepted()} value={formatDate(order.decidedAt)} />
				{/if}
				<DetailItem
					label={m.client_detail_planned()}
					value={order.scheduledFor && status !== "rejected" && status !== "cancelled"
						? formatDateTime(order.scheduledFor)
						: null}
				/>
				<DetailItem label={m.client_detail_engineer()} value={order.engineer} />
				{#if order.completedAt}
					<DetailItem label={m.client_detail_completed()} value={formatDate(order.completedAt)} />
				{/if}
			</dl>
		</Card.Content>
	</Card.Root>

	<div class="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
		{#if order.units.length}
			<section class="flex flex-col gap-3" aria-label={m.client_units()}>
				<h2 class="text-sm font-medium text-muted-foreground">{m.client_units()}</h2>
				{#each order.units as unit (unit.id)}
					<a
						href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
						class="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
						data-unit={unit.serialNumber}
					>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-medium">{unitTitle(unit)}</span>
							<span class="truncate text-xs text-muted-foreground">
								{unitLine(unit, { site: unit.site.name, location: unit.location })}
							</span>
						</span>
						<UnitStatusBadge status={unit.status} />
					</a>
				{/each}
			</section>
		{/if}

		<ExtensionSlot point={orderParts} props={{ number: order.number }} />

		{#if data.signoff}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.client_signoff_title()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<SignOff signoff={data.signoff} />
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
