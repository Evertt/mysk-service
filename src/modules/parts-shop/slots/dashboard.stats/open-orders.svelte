<!--
	@component
	The dashboard's tile of the shop's open orders (placed, confirmed or shipped), how many of them
	wait to be confirmed, linking to them.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import StatCard from "#lib/components/stat-card.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getShopOrderCounts } from "../../orders.remote.ts";

	const counts = $derived(await getShopOrderCounts());
</script>

<StatCard
	label={m.shop_dashboard_open()}
	value={formatNumber(counts.open)}
	detail={m.shop_dashboard_to_confirm({ count: counts.placed })}
>
	{#snippet action()}
		<Button variant="outline" size="sm" href={resolve("/(app)/(modules)/parts-shop")}>
			{m.common_view()}
		</Button>
	{/snippet}
</StatCard>
