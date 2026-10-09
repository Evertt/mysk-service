<!--
	@component
	The end of a unit's warranty, and whether it still covers the unit.
-->
<script lang="ts">
	import WarrantyBadge from "#lib/equipment/warranty-badge.svelte";
	import { formatDate } from "#lib/i18n";

	let { until }: { until: Date } = $props();
</script>

<div class="flex items-center gap-2">
	<time datetime={until.toISOString()} class="whitespace-nowrap tabular-nums">
		{formatDate(until)}
	</time>
	<WarrantyBadge {until} />
</div>
