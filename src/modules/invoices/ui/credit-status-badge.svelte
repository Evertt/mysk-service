<!--
	@component
	A credit note's status, with paid as settled.
-->
<script lang="ts">
	import type { CreditNoteState } from "../credit-note.ts";
	import { creditStates } from "../display.ts";

	let { state }: { state: CreditNoteState } = $props();

	const display = $derived(creditStates[state]);
</script>

<Badge variant={display.tone}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
