<!--
	@component
	The badges the tenant's modules put on an order (see `OrderTag` in `#lib/orders/extensions.ts`), e.g. a
	response time about to be missed.
-->
<script lang="ts">
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import type { OrderTag } from "../extensions.ts";

	let { tags }: { tags: OrderTag[] } = $props();

	const icons = { warning: CircleAlertIcon, danger: TriangleAlertIcon };
</script>

{#each tags as tag, i (i)}
	{@const Icon = icons[tag.tone]}
	<Badge variant={tag.tone} title={tag.detail}>
		<Icon data-icon="inline-start" />
		{tag.label}
	</Badge>
{/each}
