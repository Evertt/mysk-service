<!--
	@component
	The condition module's badge on a unit's page in the customer portal (`client.unit.badges`,
	`#lib/client/extensions.ts`): its current score on NEN 2767's scale ("3 · Redelijk") and its
	status by its condition, named as such beside the unit's own status, with the mark of what's
	behind a planned one. Live by the unit: a condition recorded or a
	component changed is logged on it.
-->
<script lang="ts">
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";

	import { getClientUnitCondition } from "../../client/client-condition.remote.ts";
	import ScoreBadge from "../../ui/score-badge.svelte";
	import StatusBadge from "../../ui/status-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getClientUnitCondition(serialNumber));
	// A number, so a refresh that answers the same unit keeps watching it.
	const unitId = $derived(data.unitId);
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unitId }),
		() => getClientUnitCondition(serialNumber).refresh(),
	);
</script>

<span class="inline-flex items-center gap-1.5" data-client-condition={data.status}>
	<span class="text-xs text-muted-foreground">{m.condition_client_unit_badge()}</span>
	<ScoreBadge score={data.score} />
	<StatusBadge status={data.status} concern={data.concern} />
</span>
