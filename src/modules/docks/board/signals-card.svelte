<!--
	@component
	What the door-open time signals, as the mockup lists it: under 40 minutes nothing, 40–60 a
	notice to the dock planner, over 60 a breakdown order (`server/rules.ts`).
-->
<script lang="ts">
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	const signals = $derived<{ band: string; text: string; tone: BadgeTone }[]>([
		{ band: m.docks_signal_normal_band(), text: m.docks_signal_normal_text(), tone: "neutral" },
		{ band: m.docks_signal_amber_band(), text: m.docks_signal_amber_text(), tone: "warning" },
		{ band: m.docks_signal_red_band(), text: m.docks_signal_red_text(), tone: "danger" },
	]);
</script>

<Card.Root data-dock-signals>
	<Card.Header>
		<Card.Title>{m.docks_signals_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<ul class="flex flex-col gap-2 text-sm text-muted-foreground">
			{#each signals as signal (signal.band)}
				<li class="flex flex-wrap items-baseline gap-2">
					<Badge variant={signal.tone} class="tabular-nums">{signal.band}</Badge>
					<span>{signal.text}</span>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
