<!--
	@component
	The "Signalering" card, after the mockup: the selection's zones over their thresholds, its doors
	open too long and its zones near their thresholds, at most four; or that every zone is within
	them.
-->
<script lang="ts">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import { formatMinutes } from "../display.ts";
	import type { signalsOf } from "./scope.ts";

	let { signals }: { signals: ReturnType<typeof signalsOf> } = $props();

	const what = (signal: (typeof signals)[number]) =>
		signal.kind === "over"
			? m.energy_signal_over()
			: signal.kind === "near"
				? m.energy_signal_near()
				: m.energy_signal_door({ minutes: formatMinutes(signal.minutes) });
</script>

<section
	class="rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
	aria-labelledby="energy-signals"
	data-signals
>
	<div class="flex items-center gap-2">
		<TriangleAlertIcon class="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
		<h2 id="energy-signals" class="text-sm font-semibold">{m.energy_signals_title()}</h2>
	</div>
	<ul class="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
		{#each signals as signal (signal.key)}
			<li data-signal={signal.kind}><strong>{signal.name}</strong>: {what(signal)}.</li>
		{:else}
			<li data-signal="none">{m.energy_signals_none()}</li>
		{/each}
	</ul>
</section>
