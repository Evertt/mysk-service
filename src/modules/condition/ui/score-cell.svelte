<!--
	@component
	A unit's latest condition in the equipment list: its bar, or a dash without one.
-->
<script lang="ts">
	import type { ScoreValue } from "../columns/equipment.list.columns.ts";
	import ConditionBar from "./condition-bar.svelte";

	let { value }: { value: ScoreValue } = $props();
</script>

<ConditionBar score={value?.score ?? null} band={value?.band ?? null} />
