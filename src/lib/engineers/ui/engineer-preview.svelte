<!--
	@component
	An engineer's hover card (`EngineerLink`): their name, phone and email, and how many orders they
	have today and open, as `getEngineer` answered them (which the engineer's page shares).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { engineerSpecialtyDisplay } from "../display.ts";
	import type { getEngineer } from "../engineers.remote.ts";

	let { engineer, counts }: Awaited<ReturnType<typeof getEngineer>> = $props();
</script>

<div class="flex flex-col gap-3" data-engineer-preview={engineer.id}>
	<div class="flex items-center justify-between gap-2">
		<span class="font-medium">{engineer.name}</span>
		<EnumBadge display={engineerSpecialtyDisplay} value={engineer.specialty} />
	</div>
	<!-- An email address has the card's width. -->
	<dl class="grid gap-3">
		<DetailItem label={m.engineers_field_phone()} value={engineer.phone} />
		<DetailItem label={m.engineers_field_email()} value={engineer.email} />
	</dl>
	<dl class="grid grid-cols-2 gap-3">
		<DetailItem label={m.engineers_preview_today()} value={formatNumber(counts.today)} />
		<DetailItem label={m.engineers_stats_open_orders()} value={formatNumber(counts.openOrders)} />
	</dl>
</div>
