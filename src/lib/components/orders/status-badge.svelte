<script lang="ts">
	import type { OrderStatus } from "#lib/models.js";

	import { statuses } from "./display.js";

	let { status }: { status: OrderStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
