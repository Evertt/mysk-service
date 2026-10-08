<script lang="ts">
	import { levels } from "./display.js";
	import type { ContractLevel } from "./model.js";

	let { level }: { level: ContractLevel } = $props();

	const display = $derived(levels[level]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
