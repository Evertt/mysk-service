<!--
	@component
	A customer's key figures on their page, as the SHLTR mockup's customer card has them: icon and
	label on the left, the figure on the right. Open orders, revenue, equipment (and how many need
	attention) and the year they became a customer.
-->
<script lang="ts">
	import BanknoteIcon from "@lucide/svelte/icons/banknote";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import StatTile from "#lib/components/stat-tile.svelte";
	import { getTimeZone } from "#lib/dates.ts";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";

	import { type getCustomer, getCustomerRevenue } from "../customers.remote.ts";

	let { data }: { data: Awaited<ReturnType<typeof getCustomer>> } = $props();

	const customer = $derived(data.customer);
	const stats = $derived(data.stats);
	const needsAttention = $derived(
		customer.equipment.filter(
			(unit) => unit.status === "needs_service" || unit.status === "out_of_service",
		).length,
	);
	const revenue = $derived(await getCustomerRevenue(customer.code));
</script>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-customer-figures>
	<StatTile
		layout="row"
		tone="brand"
		icon={ClipboardListIcon}
		label={m.customers_column_open_orders()}
		value={formatNumber(stats.openOrders)}
		detail={m.customers_stats_orders_total({ count: stats.orders })}
	/>
	<StatTile
		layout="row"
		tone="brand"
		icon={BanknoteIcon}
		label={m.customers_stats_revenue()}
		value={formatCents(revenue.revenue)}
		detail={m.customers_stats_revenue_orders({ count: revenue.revenueOrders })}
	/>
	<StatTile
		layout="row"
		tone={needsAttention ? "warning" : "brand"}
		icon={WrenchIcon}
		label={m.customers_column_equipment()}
		value={formatNumber(customer.equipment.length)}
		detail={needsAttention
			? m.customers_stats_attention({ count: needsAttention })
			: m.customers_stats_all_working()}
	/>
	<StatTile
		layout="row"
		tone="brand"
		icon={CalendarDaysIcon}
		label={m.customers_column_since()}
		value={String(customer.createdAt.toZonedDateTimeISO(getTimeZone()).year)}
		detail={stats.lastOrderAt
			? m.customers_stats_last_order({ date: formatDate(stats.lastOrderAt) })
			: m.customers_stats_no_orders()}
	/>
</div>
