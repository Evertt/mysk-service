<script lang="ts">
	import type { OrderStatus } from "#lib/models.ts";

	import { statuses } from "./display.ts";

	let { status }: { status: OrderStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
