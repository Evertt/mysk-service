<!--
	@component
	The engineer's open orders on a unit or location whose QR code they scanned, the next first; or
	that there are none.
-->
<script lang="ts">
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import type { ComponentProps } from "svelte";

	import WorkCard from "./work-card.svelte";

	let {
		orders,
	}: {
		orders: (ComponentProps<typeof WorkCard>["order"] & {
			id: number;
			scheduledFor: Temporal.Instant | null;
		})[];
	} = $props();
</script>

<section class="flex flex-col gap-3" aria-label={m.portal_scan_open_orders()}>
	<h2 class="text-sm font-medium text-muted-foreground">{m.portal_scan_open_orders()}</h2>
	{#each orders as order (order.id)}
		<WorkCard {order} when={{ date: order.scheduledFor, show: "date" }} />
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><ClipboardCheckIcon /></Empty.Media>
				<Empty.Title>{m.portal_scan_no_orders()}</Empty.Title>
				<Empty.Description>{m.portal_scan_no_orders_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/each}
</section>
