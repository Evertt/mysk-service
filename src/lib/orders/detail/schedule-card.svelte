<!--
	@component
	When an order was made, is scheduled for and was completed, on its page.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";

	let {
		order,
	}: {
		order: Pick<
			Awaited<ReturnType<typeof getOrder>>["order"],
			"createdAt" | "scheduledFor" | "completedAt"
		>;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_schedule()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<dl class="grid grid-cols-3 gap-4">
			<DetailItem label={m.orders_column_created()} value={formatDate(order.createdAt)} />
			<DetailItem
				label={m.orders_column_scheduled()}
				value={order.scheduledFor && formatDate(order.scheduledFor)}
			/>
			<DetailItem
				label={m.orders_column_completed()}
				value={order.completedAt && formatDate(order.completedAt)}
			/>
		</dl>
	</Card.Content>
</Card.Root>
