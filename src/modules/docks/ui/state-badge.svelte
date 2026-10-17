<!--
	@component
	A dock's state as a badge: Vrij, Bezet, Laden or Storing, coloured by what it means.
-->
<script lang="ts">
	import { stateTones } from "../display.ts";
	import { dockLabels } from "../labels.ts";
	import type { DockState } from "../model.ts";

	let { state }: { state: DockState } = $props();
</script>

<Badge variant={stateTones[state]} data-dock-state={state}>
	{dockLabels.label("dockState", state)}
</Badge>
