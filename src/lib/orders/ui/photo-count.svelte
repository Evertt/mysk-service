<!--
	@component
	How many photos an order has, small, for a line in a list of orders (a unit's service history in
	the portals): a camera and the count, or nothing without photos. Plain text, so it can sit inside
	the link to the order.
-->
<script lang="ts">
	import CameraIcon from "@lucide/svelte/icons/camera";

	let { count, class: className }: { count: number; class?: string } = $props();
</script>

{#if count}
	<span
		class={["inline-flex items-center gap-1 text-xs text-muted-foreground", className]}
		data-photo-count={count}
	>
		<CameraIcon class="size-3.5 shrink-0" aria-hidden="true" />
		{m.orders_count_photos({ count })}
	</span>
{/if}
