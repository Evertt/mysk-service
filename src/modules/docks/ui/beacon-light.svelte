<!--
	@component
	A dock's beacon as the mockup's Salvo block shows it: its lamp in its colour on the dark housing,
	"Beacon", and what it means ("Groen — veilig laden").
-->
<script lang="ts">
	import { beaconColours } from "../display.ts";
	import { dockLabels } from "../labels.ts";
	import type { Beacon } from "../model.ts";

	let { beacon }: { beacon: Beacon } = $props();
</script>

<div class="flex items-start gap-2" data-beacon={beacon}>
	<span
		class="mt-0.5 grid h-7 w-6 shrink-0 place-items-center rounded-[3px] bg-slate-900"
		aria-hidden="true"
	>
		<span class="size-3 rounded-full {beaconColours[beacon]}"></span>
	</span>
	<div class="min-w-0">
		<div class="text-[0.6875rem] text-muted-foreground">{m.docks_beacon_label()}</div>
		<div class="text-xs font-semibold">{dockLabels.label("beacon", beacon)}</div>
	</div>
</div>
