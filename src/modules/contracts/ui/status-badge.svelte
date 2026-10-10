<!--
	@component
	A contract's status; derive it from the contract's period with `contractStatus` from
	`./model.ts`.
-->
<script lang="ts">
	import { statuses } from "../display.ts";
	import type { ContractStatus } from "../model.ts";

	let { status }: { status: ContractStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
