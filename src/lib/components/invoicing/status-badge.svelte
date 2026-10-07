<!--
	@component
	An invoice's status, with overdue for a sent one past its due date; derive it with
	`invoiceState` from `./invoice.js`.
-->
<script lang="ts">
	import { states } from "./display.js";
	import type { InvoiceState } from "./invoice.js";

	let { state }: { state: InvoiceState } = $props();

	const display = $derived(states[state]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
