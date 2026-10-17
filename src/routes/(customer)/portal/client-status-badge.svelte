<!--
	@component
	An order's status as the customer reads it (`clientStatus()`): not accepted yet, accepted,
	planned, under way, done, rejected or cancelled.
-->
<script lang="ts">
	import type { OrderStatus } from "#lib/models.ts";

	import { clientStatus, clientStatusDisplay } from "./client-status.ts";

	let { status, rejectionReason }: { status: OrderStatus; rejectionReason: string | null } =
		$props();

	const display = $derived(clientStatusDisplay[clientStatus(status, rejectionReason)]);
</script>

<Badge variant={display.tone} data-client-status={clientStatus(status, rejectionReason)}>
	<display.icon data-icon="inline-start" />
	{display.label()}
</Badge>
