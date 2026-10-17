<!--
	@component
	A checklist's outcome as a badge: a draft, approved, or how many points it rejected.
-->
<script lang="ts">
	import { outcome } from "../display.ts";
	import type { ChecklistStatus, PointResult } from "../model.ts";

	let {
		checklist,
	}: {
		checklist: { status: ChecklistStatus; results: readonly { result: PointResult | null }[] };
	} = $props();

	const shown = $derived(outcome(checklist));
</script>

<Badge variant={shown.tone} data-outcome>{shown.label}</Badge>
