<!--
	@component
	The open orders that have no date yet, beside the board. They're dragged onto it (`drag`), or
	planned with `onschedule`.
-->
<script lang="ts">
	import type { createBoardDrag } from "./board-drag.svelte.js";
	import type { ScheduleOrder } from "./board.js";
	import OrderCard from "./order-card.svelte";

	let {
		backlog,
		drag,
		onschedule,
	}: {
		backlog: ScheduleOrder[];
		drag: ReturnType<typeof createBoardDrag>;
		onschedule: (order: ScheduleOrder) => void;
	} = $props();
</script>

<Card.Root
	size="sm"
	role="region"
	aria-label={m.schedule_backlog()}
	class="lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:desktop:max-h-full"
>
	<Card.Header>
		<Card.Title>{m.schedule_backlog()}</Card.Title>
		<Card.Description>
			{m.schedule_backlog_description({ count: backlog.length })}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
		{#each backlog as order (order.id)}
			<OrderCard
				{order}
				pending={drag.isMoving(order)}
				ondragstart={(event) => drag.start(event, order)}
				ondragend={drag.end}
				onschedule={() => onschedule(order)}
			/>
		{:else}
			<p class="text-sm text-muted-foreground">{m.schedule_backlog_empty()}</p>
		{/each}
	</Card.Content>
</Card.Root>
