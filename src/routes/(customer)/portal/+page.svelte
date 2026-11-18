<!--
	The customer portal's home, the Home tab: report a breakdown (the page's main button), the
	customer's open orders (also those not accepted yet, and reports rejected lately), what the
	tenant's modules add (e.g. units needing attention, the partner's bonus, `client.home`), and the
	latest completed work with its work orders, one under the other.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import MapPinnedIcon from "@lucide/svelte/icons/map-pinned";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { getCurrentUser } from "#lib/auth/session.remote.ts";
	import AppBar from "#lib/client/app-bar.svelte";
	import { home } from "#lib/client/extensions.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getPortalHome } from "./client.remote.ts";
	import OrderList from "./order-list.svelte";

	const [data, me] = $derived(await Promise.all([getPortalHome(), getCurrentUser()]));

	// Live: a planner accepting, rejecting or planning a report shows without a reload.
	refreshOnActivity(() => getPortalHome().refresh(), {
		types: ["order", "equipment", "site", "location"],
	});
</script>

<AppBar title={me.customer ?? m.client_title()} subtitle={m.client_title()} />

<Button href={resolve("/(customer)/portal/report")} class="primary-action" data-report-button>
	<SirenIcon data-icon="inline-start" />
	{m.client_report_title()}
</Button>

<a
	href={resolve("/(customer)/portal/sites")}
	class="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
	data-sites-link
>
	<span
		class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
	>
		<MapPinnedIcon class="size-5" aria-hidden="true" />
	</span>
	<span class="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{m.client_nav_sites()}</span>
	<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
</a>

<section class="flex flex-col gap-2" aria-label={m.client_open_orders()}>
	<h2 class="section-label px-1">
		{m.client_open_orders()}
		<span class="tabular-nums">· {formatNumber(data.open.length)}</span>
	</h2>
	{#if data.open.length}
		<OrderList orders={data.open} />
	{:else}
		<Empty.Root class="rounded-xl border bg-card">
			<Empty.Header>
				<Empty.Media variant="icon"><ClipboardCheckIcon /></Empty.Media>
				<Empty.Title>{m.client_no_open_orders()}</Empty.Title>
				<Empty.Description>{m.client_no_open_orders_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</section>

<ExtensionSlot point={home} props={{}} class="flex flex-col gap-5" />

{#if data.done.length}
	<section class="flex flex-col gap-2" aria-label={m.client_recent_work()}>
		<div class="flex items-center justify-between gap-2 px-1">
			<h2 class="section-label">{m.client_recent_work()}</h2>
			<a
				href={resolve("/(customer)/portal/orders")}
				class="-my-3 inline-flex min-h-11 items-center gap-0.5 text-[0.9375rem] font-medium text-primary"
			>
				{m.client_all_orders()}
				<ChevronRightIcon class="size-4" aria-hidden="true" />
			</a>
		</div>
		<OrderList orders={data.done} />
	</section>
{/if}
