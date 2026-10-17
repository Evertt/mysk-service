<!--
	@component
	A dock's beacon: its lamp in its colour, and what it means ("Groen — veilig laden").
-->
<script lang="ts">
	import { beaconColours } from "../display.ts";
	import { dockLabels } from "../labels.ts";
	import type { Beacon } from "../model.ts";

	let { beacon }: { beacon: Beacon } = $props();
</script>

<span class="inline-flex items-center gap-2" data-beacon={beacon}>
	<span class="size-2.5 shrink-0 rounded-full {beaconColours[beacon]}" aria-hidden="true"></span>
	<span>{dockLabels.label("beacon", beacon)}</span>
</span>
