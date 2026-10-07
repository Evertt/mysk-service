<!--
	@component
	An order's status in the orders table, with the badges the tenant's modules put on it.
-->
<script lang="ts">
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import type { OrderStatus } from "#lib/models.js";
	import type { OrderTag } from "#lib/modules.js";

	import OrderTags from "./order-tags.svelte";

	let { status, tags }: { status: OrderStatus; tags: OrderTag[] } = $props();
</script>

<div class="flex flex-wrap items-center gap-1">
	<StatusBadge {status} />
	<OrderTags {tags} />
</div>
