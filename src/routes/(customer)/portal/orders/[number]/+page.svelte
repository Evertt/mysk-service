<!--
	One of the customer's orders in the portal: what it's about and where it stands (reported, not
	accepted yet, accepted, planned for a day with the engineer's first name, done, or rejected with
	the planner's reason), its units, the tenant's modules' cards (`client.order`, e.g. its
	checklists' results and the work order to print) and, once done, the work order's sign-off, one
	under the other. The app bar names its type and number, and leads back to the orders.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";

	import AppBar from "#lib/client/app-bar.svelte";
	import { order as orderParts } from "#lib/client/extensions.ts";
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import Callout from "#lib/components/callout.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDate, formatDateTime, label } from "#lib/i18n/index.ts";
	import { SignOff, WorkUnits } from "#lib/orders/components.ts";

	import { clientStatus, clientStatusDisplay } from "../../client-status.ts";
	import { getPortalOrder } from "../../client.remote.ts";
	import { portalPriority } from "../../urgency.ts";
	import type { PageProps } from "./$types";
	import OrderTimeline from "./order-timeline.svelte";
	import ReportCard from "./report-card.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalOrder(params.number));
	const order = $derived(data.order);
	const status = $derived(clientStatus(order.status, order.rejectionReason));
	// Just reported from the form.
	const reported = $derived(page.url.searchParams.has("reported"));

	// Live: the order itself, and the units and sites it shows (not keyed to the page: any change
	// of one the contact may read).
	refreshOnRecordChange(
		() => ({ type: "order", id: order.id }),
		() => getPortalOrder(params.number).refresh(),
	);
	refreshOnActivity(() => getPortalOrder(params.number).refresh(), {
		types: ["equipment", "site", "location"],
	});
</script>

<AppBar
	title={label("orderType", order.type)}
	subtitle={order.number}
	back={{ href: resolve("/(customer)/portal/orders"), label: m.client_nav_orders() }}
/>

{#if reported && status === "awaiting"}
	<Callout
		tone="success"
		icon={CircleCheckIcon}
		title={m.client_reported_title()}
		role="status"
		data-reported
	>
		<p class="text-muted-foreground">{m.client_reported_description()}</p>
	</Callout>
{/if}

<header class="flex flex-col items-start gap-2 rounded-xl border bg-card p-4">
	<EnumBadge display={clientStatusDisplay} value={status} data-client-status={status} />
	<p class="text-[0.9375rem] whitespace-pre-line">{order.description}</p>
</header>

{#if status === "rejected"}
	<Callout tone="danger" icon={CircleXIcon} title={m.client_rejected_title()} data-rejection>
		<p class="whitespace-pre-line">{order.rejectionReason}</p>
	</Callout>
{/if}

<div class="flex flex-col gap-5">
	<Card.Root class="rounded-xl" data-order-details>
		<Card.Content>
			<dl class="grid grid-cols-2 gap-4">
				{#if order.reportedBy}
					<DetailItem label={m.client_detail_reported()} value={formatDate(order.createdAt)} />
					<DetailItem label={m.client_detail_reported_by()} value={order.reportedBy} />
				{:else}
					<DetailItem label={m.client_detail_created()} value={formatDate(order.createdAt)} />
				{/if}
				<DetailItem label={m.client_detail_priority()} value={portalPriority(order.priority)} />
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

	<div class="flex min-w-0 flex-col gap-5">
		<OrderTimeline {order} />
		{#if order.units.length}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.client_units()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<WorkUnits
						units={order.units}
						href={(unit) =>
							resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
						showSite
					/>
				</Card.Content>
			</Card.Root>
		{/if}

		<ReportCard {order} />

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
