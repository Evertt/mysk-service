<!--
	Stat tiles in the card layout as the dashboard has them, `width` px wide: in its grid, one in a link, one with an
	action, their big numbers squeezed to fit.
-->
<script lang="ts">
	import { createRawSnippet } from "svelte";

	import StatTile from "#lib/components/stat-tile.svelte";
	import { statGrid } from "#routes/(app)/(dashboard)/dashboard-grids.ts";

	let { width }: { width: number } = $props();

	const view = createRawSnippet(() => ({ render: () => '<a href="/condition">View</a>' }));
</script>

<div class={statGrid} style:width="{width}px" data-stat-grid>
	<StatTile
		layout="card"
		size="large"
		label="Open orders"
		value="115"
		detail="3 without an engineer"
	/>
	<a href="/orders" class="rounded-xl">
		<StatTile
			layout="card"
			size="large"
			label="Awaiting acceptance"
			value="€178,172.11"
			detail="Reported in the portal"
		/>
	</a>
	<StatTile layout="card" size="large" label="Revenue" value="€178,172.11" detail="56 orders" />
	<StatTile
		layout="card"
		size="large"
		label="Needs attention"
		value="€178,172.11"
		detail="3 critical"
		action={view}
	/>
</div>
