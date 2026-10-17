<!--
	@component
	The dashboard's tile of materials running low or out, linking to them in the materials list.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PackageIcon from "@lucide/svelte/icons/package";

	import StatTile from "#lib/components/stat-tile.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getStockLevels } from "../../dashboard/stock-levels.remote.ts";

	const stock = $derived(await getStockLevels());
</script>

<StatTile
	layout="stacked"
	icon={PackageIcon}
	tone="warning"
	label={m.materials_dashboard_low_stock()}
	value={formatNumber(stock.low + stock.out)}
	detail={m.materials_dashboard_low_stock_of({ out: formatNumber(stock.out), count: stock.total })}
>
	{#snippet action()}
		<!-- The materials list, filtered to the low and out of stock ones. -->
		<Button
			variant="outline"
			size="sm"
			href="{resolve('/(app)/(modules)/materials')}?stock=out,low"
		>
			{m.common_view()}
		</Button>
	{/snippet}
</StatTile>
