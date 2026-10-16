<script lang="ts">
	import type { OrderPriority } from "#lib/models.ts";

	import { priorities } from "../display.ts";

	let { priority }: { priority: OrderPriority } = $props();

	const display = $derived(priorities[priority]);
</script>

<Badge variant={display.tone}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
