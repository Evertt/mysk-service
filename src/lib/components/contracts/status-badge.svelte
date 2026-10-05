<!--
	@component
	A contract's status; derive it from the contract's period with `contractStatus` from
	`#lib/models.js`.
-->
<script lang="ts">
	import type { ContractStatus } from "#lib/models.js";

	import { statuses } from "./display.js";

	let { status }: { status: ContractStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
