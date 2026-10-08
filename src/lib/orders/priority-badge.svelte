<script lang="ts">
	import type { OrderPriority } from "#lib/models.js";

	import { priorities } from "./display.js";

	let { priority }: { priority: OrderPriority } = $props();

	const display = $derived(priorities[priority]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
