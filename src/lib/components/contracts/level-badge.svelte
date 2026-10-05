<script lang="ts">
	import type { ContractLevel } from "#lib/models.js";

	import { levels } from "./display.js";

	let { level }: { level: ContractLevel } = $props();

	const display = $derived(levels[level]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
