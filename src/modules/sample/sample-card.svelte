<!--
	@component
	The sample module's card on the dashboard (the `dashboard` slot in `#lib/modules.ts`).
-->
<script lang="ts">
	import { formatNumber } from "#lib/format.js";

	import { getSampleSummary } from "./sample.remote.js";

	const summary = $derived(await getSampleSummary());
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.sample_dashboard_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{m.sample_dashboard_count({ count: formatNumber(summary.count) })}
	</Card.Content>
</Card.Root>
