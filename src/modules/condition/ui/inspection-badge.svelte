<!--
	@component
	A unit's inspection status as the Connect page shows it (with checklists on): valid, expiring,
	expired, rejected; a dash without one.
-->
<script lang="ts">
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	import type { InspectionState } from "../model.ts";

	let { status }: { status: string | null } = $props();

	const tones: Record<InspectionState, BadgeTone> = {
		valid: "success",
		expiring: "warning",
		rejected: "warning",
		expired: "danger",
		none: "neutral",
	};
	const labels: Record<InspectionState, () => string> = {
		valid: m.condition_inspection_valid,
		expiring: m.condition_inspection_expiring,
		rejected: m.condition_inspection_rejected,
		expired: m.condition_inspection_expired,
		none: m.condition_inspection_none,
	};
	const known = $derived(
		status && status !== "none" && status in tones ? (status as InspectionState) : null,
	);
</script>

{#if known}
	<Badge variant={tones[known]} data-inspection={known}>{labels[known]()}</Badge>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
