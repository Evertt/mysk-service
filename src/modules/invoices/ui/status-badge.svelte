<!--
	@component
	An invoice's status, with overdue for a sent one past its due date; derive it with
	`invoiceState` from `./invoice.ts`.
-->
<script lang="ts">
	import { states } from "../display.ts";
	import type { InvoiceState } from "../invoice.ts";

	let { state }: { state: InvoiceState } = $props();

	const display = $derived(states[state]);
</script>

<Badge variant={display.tone}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
