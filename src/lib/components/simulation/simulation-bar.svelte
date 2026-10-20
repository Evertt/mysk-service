<!--
	@component
	The bar of a module's simulation for a demo, as the client's mockup has it ("P1 simulatie"):
	start or pause, reset, the speeds 1× to 30×, and a badge with the state. Managers drive it;
	members see its state. While the simulation runs and the page is visible, it asks the server to
	tick it every 15 seconds (the cron does it every 15 minutes too), so the demo moves on. Renders
	nothing for a tenant that's offered no simulation of the module.
-->
<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RefreshCcwIcon from "@lucide/svelte/icons/refresh-ccw";
	import { toast } from "svelte-sonner";

	import { errorMessage } from "#lib/errors/messages.ts";
	import type { ModuleId } from "#lib/modules/ids.ts";
	import { simulationSpeeds } from "#lib/simulation/extensions.ts";

	import SimulationBadge from "./simulation-badge.svelte";
	import {
		getSimulation,
		playSimulation,
		resetSimulationState,
		setSimulationSpeed,
		tickSimulation,
	} from "./simulation.remote.ts";

	let {
		module,
		label,
	}: {
		module: ModuleId;
		/** The bar's title, e.g. "Salvo simulatie"; by default "Simulatie". */
		label?: string;
	} = $props();

	/** How often the open page ticks the simulation. */
	const tickEvery = 15_000;
	/**
	 * When the first tick comes: a second on, so that on Start it has a whole second to cover (a
	 * tick ends on a whole second, `runSimulations()`), and a playing simulation moves at once.
	 */
	const firstTickAfter = 1_100;

	const simulation = $derived(await getSimulation(module));
	let busy = $state(false);

	// While it runs: a tick now and then, while the page is visible. Out of the effect's own run
	// (a command keeps state of its own, which the effect mustn't read).
	const running = $derived(simulation?.running ?? false);
	$effect(() => {
		if (!running) return;
		const tick = () => {
			if (document.visibilityState !== "visible") return;
			tickSimulation(module).catch(() => {
				// The next tick, or the cron's, tries again.
			});
		};
		const first = setTimeout(tick, firstTickAfter);
		const timer = setInterval(tick, tickEvery);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	});

	async function act(work: () => Promise<unknown>, done?: string) {
		busy = true;
		try {
			await work();
			if (done) toast.success(done);
		} catch (error) {
			toast.error(errorMessage(error, m.common_error_generic()));
		} finally {
			busy = false;
		}
	}
</script>

{#if simulation}
	<section
		class="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-card-foreground sm:p-4"
		aria-label={label ?? m.simulation_title()}
		data-simulation={module}
		data-running={simulation.running}
		data-speed={simulation.speed}
	>
		<span class="mr-1 inline-flex items-center gap-2 text-sm font-semibold">
			<ActivityIcon class="size-4 text-primary" aria-hidden="true" />
			{label ?? m.simulation_title()}
		</span>
		{#if simulation.canManage}
			<Button
				size="sm"
				variant={simulation.running ? "outline" : "default"}
				disabled={busy}
				onclick={() => act(() => playSimulation({ module, running: !simulation.running }))}
			>
				{#if simulation.running}
					<PauseIcon data-icon="inline-start" />
					{m.simulation_pause()}
				{:else}
					<PlayIcon data-icon="inline-start" />
					{m.simulation_play()}
				{/if}
			</Button>
			<Button
				size="icon-sm"
				variant="outline"
				disabled={busy}
				title={m.simulation_reset()}
				aria-label={m.simulation_reset()}
				onclick={() => act(() => resetSimulationState(module), m.simulation_reset_done())}
			>
				<RefreshCcwIcon />
			</Button>
			<div
				class="flex rounded-md border bg-muted p-0.5"
				role="group"
				aria-label={m.simulation_speed_label()}
			>
				{#each simulationSpeeds as speed (speed)}
					<Button
						size="sm"
						variant="ghost"
						class="h-7 px-2.5 {simulation.speed === speed
							? 'bg-card text-primary shadow-sm hover:bg-card'
							: 'text-muted-foreground'}"
						aria-pressed={simulation.speed === speed}
						disabled={busy}
						onclick={() => act(() => setSimulationSpeed({ module, speed }))}
					>
						{m.simulation_speed({ speed })}
					</Button>
				{/each}
			</div>
		{/if}
		<SimulationBadge {module} />
		<span class="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
			{m.simulation_note()}
		</span>
	</section>
{/if}
