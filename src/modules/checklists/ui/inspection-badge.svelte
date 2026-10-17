<!--
	@component
	A unit's inspection status as a badge, coloured by what it means: valid, expiring, expired,
	rejected, or none yet.
-->
<script lang="ts">
	import { inspectionTones } from "../display.ts";
	import { checklistLabels } from "../labels.ts";
	import type { InspectionStatus } from "../model.ts";

	let { status }: { status: InspectionStatus } = $props();
</script>

<Badge variant={inspectionTones[status]} data-inspection={status}>
	{checklistLabels.label("inspectionStatus", status)}
</Badge>
