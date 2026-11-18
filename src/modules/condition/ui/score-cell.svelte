<!--
	@component
	A unit's current condition in the equipment list: its score on NEN 2767's scale, or a dash
	without one.
-->
<script lang="ts">
	import type { ScoreValue } from "../columns/equipment.list.columns.ts";
	import ScoreBadge from "./score-badge.svelte";

	let { value }: { value: ScoreValue } = $props();
</script>

<ScoreBadge score={value?.score ?? null} />
