<!--
	@component
	The checklists module's fact on a unit's page in the customer portal (`client.unit.facts`,
	`#lib/client/extensions.ts`): its inspection status as a badge, and until when it's valid (or
	since when it isn't). Its completed inspections are its card's (`client.unit`).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import { getClientUnitInspection } from "../../client/client-checklists.remote.ts";
	import { inspectionStatusDisplay } from "../../display.ts";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getClientUnitInspection(serialNumber));
</script>

<dl data-client-inspection-fact={data.status}>
	<DetailItem label={m.checklists_client_inspection()}>
		<span class="flex flex-col items-start gap-1">
			<EnumBadge display={inspectionStatusDisplay} value={data.status} />
			{#if data.validUntil}
				<span class="text-[0.8125rem] text-muted-foreground tabular-nums">
					{data.status === "expired"
						? m.checklists_expired_on({ date: formatDate(data.validUntil) })
						: m.checklists_valid_until({ date: formatDate(data.validUntil) })}
				</span>
			{/if}
		</span>
	</DetailItem>
</dl>
