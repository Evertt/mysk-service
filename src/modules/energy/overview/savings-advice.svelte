<!--
	@component
	The savings advice ("Besparingsadvies", §2.5), worked out from the scope's figures: shifting the
	peak to the early afternoon, what the comparison with the previous period shows, and a night mode
	for climate and lighting.
-->
<script lang="ts">
	import { formatPercent } from "#lib/i18n/index.ts";

	import { formatKw, formatKwh } from "../display.ts";
	import type { Period } from "../model.ts";
	import { type Kpis, savingsOf } from "./scope.ts";

	let { kpis, period }: { kpis: Kpis; period: Period } = $props();

	const advice = $derived(savingsOf(kpis));
	const comparison = $derived.by(() => {
		const { change } = advice;
		if (change === null) return m.energy_advice_no_comparison();
		const values = {
			change: formatPercent(Math.abs(change), { basis: "percent" }),
			previous: period === "day" ? m.energy_compared_yesterday() : m.energy_compared_last_month(),
		};
		return change > 0 ? m.energy_advice_more(values) : m.energy_advice_less(values);
	});
</script>

<Card.Root data-savings>
	<Card.Header>
		<Card.Title>{m.energy_advice_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<ul class="flex list-disc flex-col gap-2 pl-5 text-sm">
			<li data-advice="peak">{m.energy_advice_peak({ kw: formatKw(advice.peakShiftKw) })}</li>
			<li data-advice="comparison">{comparison}</li>
			<li data-advice="night">{m.energy_advice_night({ kwh: formatKwh(advice.nightModeKwh) })}</li>
		</ul>
	</Card.Content>
</Card.Root>
