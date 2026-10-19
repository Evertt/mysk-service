<!--
	The customer portal's home: report a breakdown, the customer's open orders (also those not
	accepted yet, and reports rejected lately), what the tenant's modules add (e.g. units needing
	attention, `client.home`), and the latest completed work with its work orders. On a phone in
	that order; on a wide screen the modules' cards come first, over the orders and the work.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { home } from "#lib/client/extensions.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getPortalHome, watchPortal } from "./client.remote.ts";
	import OrderList from "./order-list.svelte";

	const data = $derived(await getPortalHome());

	// Live: a planner accepting, rejecting or planning a report shows without a reload.
	refreshOnChange(watchPortal, () => getPortalHome().refresh());
</script>

<svelte:head>
	<title>{m.client_title()}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-semibold tracking-tight">{m.client_title()}</h1>
	<Button href={resolve("/(customer)/portal/report")} size="lg">
		<SirenIcon data-icon="inline-start" />
		{m.client_report_title()}
	</Button>
</div>

<!-- On a wide screen a dashboard: what the tenant's modules add (e.g. the partner's bonus and
	wallet side by side) on top, then the open orders and the latest completed work as tables, side
	by side on a very wide one. -->
<div class="grid items-start gap-6 2xl:grid-cols-3">
	<section
		class={["flex min-w-0 flex-col gap-3", data.done.length ? "2xl:col-span-2" : "2xl:col-span-3"]}
		aria-label={m.client_open_orders()}
	>
		<h2 class="text-sm font-medium text-muted-foreground">
			{m.client_open_orders()}
			<span class="tabular-nums">· {formatNumber(data.open.length)}</span>
		</h2>
		{#if data.open.length}
			<OrderList orders={data.open} />
		{:else}
			<Empty.Root class="border">
				<Empty.Header>
					<Empty.Media variant="icon"><ClipboardCheckIcon /></Empty.Media>
					<Empty.Title>{m.client_no_open_orders()}</Empty.Title>
					<Empty.Description>{m.client_no_open_orders_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</section>

	<ExtensionSlot
		point={home}
		props={{}}
		class="flex min-w-0 flex-col gap-6 lg:order-first 2xl:col-span-3"
	/>

	{#if data.done.length}
		<section class="flex min-w-0 flex-col gap-3" aria-label={m.client_recent_work()}>
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">{m.client_recent_work()}</h2>
				<a
					href={resolve("/(customer)/portal/orders")}
					class="text-sm text-muted-foreground underline-offset-4 hover:underline"
				>
					{m.client_all_orders()}
				</a>
			</div>
			<OrderList orders={data.done} />
		</section>
	{/if}
</div>
