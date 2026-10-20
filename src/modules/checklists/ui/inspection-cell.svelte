<!--
	@component
	A unit's inspection status in the equipment list: a badge, with the last valid day on hover; a
	dash for a unit without a completed inspection.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { InspectionValue } from "../columns/equipment.list.ts";
	import { inspectionStatusDisplay } from "../display.ts";

	let { value }: { value: InspectionValue } = $props();
</script>

{#if value}
	<span
		class="inline-flex items-center"
		title={m.checklists_valid_until({ date: formatDate(Temporal.PlainDate.from(value.until)) })}
	>
		<EnumBadge
			display={inspectionStatusDisplay}
			value={value.status}
			data-inspection={value.status}
		/>
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
