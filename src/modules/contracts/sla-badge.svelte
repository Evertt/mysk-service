<!--
	@component
	Where a covered order's response stands (on track, at risk, overdue, responded); see
	`responseDeadline` in `coverage.ts`.
-->
<script lang="ts">
	import type { SlaState } from "./coverage.js";
	import { slaStates } from "./display.js";

	let { state }: { state: SlaState } = $props();

	const display = $derived(slaStates[state]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
