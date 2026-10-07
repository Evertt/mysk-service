<script lang="ts">
	import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";

	import { getMyWork } from "./portal.remote.js";
	import WorkCard from "./work-card.svelte";
	import { groupByDay } from "./work.js";

	const work = $derived(await getMyWork());
	const days = $derived(groupByDay(work.open));
</script>

<svelte:head>
	<title>My work</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">My work</h1>

{#each days as group (group.label)}
	<section class="flex flex-col gap-3" aria-label={group.label}>
		<h2 class="text-sm font-medium text-muted-foreground">
			{group.label}
			<span class="tabular-nums">· {group.orders.length}</span>
		</h2>
		{#each group.orders as order (order.id)}
			<WorkCard {order} when={{ date: order.scheduledFor, show: "time" }} />
		{/each}
	</section>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><CalendarCheckIcon /></Empty.Media>
			<Empty.Title>Nothing planned</Empty.Title>
			<Empty.Description>The office hasn't planned any work for you yet.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/each}

{#if work.recent.length}
	<section class="flex flex-col gap-3" aria-label="Recently completed">
		<h2 class="text-sm font-medium text-muted-foreground">Recently completed</h2>
		{#each work.recent as order (order.id)}
			<WorkCard {order} when={{ date: order.completedAt, show: "date" }} />
		{/each}
	</section>
{/if}
