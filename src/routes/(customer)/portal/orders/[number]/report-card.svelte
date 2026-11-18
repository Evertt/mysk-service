<!--
	@component
	What the customer's contact told about a breakdown they reported, on its page in the portal: the
	kind of fault they chose, and the order's photos (theirs, and those its engineer or the office
	added later). Theirs they may delete while the order is still to be done. Nothing for an order
	without either (one made in the office without photos, or a report without them).
-->
<script lang="ts">
	import { label } from "#lib/i18n/index.ts";
	import type { ReportFault } from "#lib/models.ts";
	import { OrderPhotos } from "#lib/orders/components.ts";

	let {
		order,
	}: {
		order: { fault: ReportFault | null; photos: readonly { id: number; deletable: boolean }[] };
	} = $props();
</script>

{#if order.fault || order.photos.length}
	<Card.Root data-report>
		<Card.Header>
			<Card.Title>{m.client_report_card_title()}</Card.Title>
			{#if order.fault}
				<Card.Description data-report-fault={order.fault}>
					{m.client_detail_fault()}: {label("reportFault", order.fault)}
				</Card.Description>
			{/if}
		</Card.Header>
		{#if order.photos.length}
			<Card.Content>
				<OrderPhotos photos={order.photos} />
			</Card.Content>
		{/if}
	</Card.Root>
{/if}
