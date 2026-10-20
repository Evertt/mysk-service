<!--
	@component
	The state of a module's simulation as a small badge, as the mockup's banner has it: a dot that
	pulses while it runs, and "simulatie 1×" or "gepauzeerd". Renders nothing without a simulation.
	`tone="banner"` for a coloured banner (white on its colour), else a badge on a card.
-->
<script lang="ts">
	import type { ModuleId } from "#lib/modules/ids.ts";

	import { getSimulation } from "./simulation.remote.ts";

	let { module, tone = "card" }: { module: ModuleId; tone?: "card" | "banner" } = $props();

	const simulation = $derived(await getSimulation(module));
</script>

{#if simulation}
	<span
		class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium {tone ===
		'banner'
			? 'bg-white/15 text-white'
			: 'border bg-muted text-muted-foreground'}"
		data-simulation-state={simulation.running ? "running" : "paused"}
	>
		<span
			class="size-1.5 rounded-full {tone === 'banner'
				? 'bg-[color-mix(in_oklch,var(--success),white_40%)]'
				: 'bg-success'} {simulation.running ? 'motion-safe:animate-pulse' : 'opacity-50'}"
			aria-hidden="true"
		></span>
		{simulation.running ? m.simulation_running({ speed: simulation.speed }) : m.simulation_paused()}
	</span>
{/if}
