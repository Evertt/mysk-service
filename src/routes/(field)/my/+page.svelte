<script lang="ts">
	import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";

	import { formatNumber } from "#lib/format.ts";

	import { getMyWork } from "./portal.remote.ts";
	import WorkCard from "./work-card.svelte";
	import { groupByDay } from "./work.ts";

	const work = $derived(await getMyWork());
	const days = $derived(groupByDay(work.open));
</script>

<svelte:head>
	<title>{m.portal_title()}</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{m.portal_title()}</h1>

{#each days as group (group.label)}
	<section class="flex flex-col gap-3" aria-label={group.label}>
		<h2 class="text-sm font-medium text-muted-foreground">
			{group.label}
			<span class="tabular-nums">· {formatNumber(group.orders.length)}</span>
		</h2>
		{#each group.orders as order (order.id)}
			<WorkCard {order} when={{ date: order.scheduledFor, show: "time" }} />
		{/each}
	</section>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><CalendarCheckIcon /></Empty.Media>
			<Empty.Title>{m.portal_nothing_planned()}</Empty.Title>
			<Empty.Description>{m.portal_nothing_planned_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/each}

{#if work.recent.length}
	<section class="flex flex-col gap-3" aria-label={m.portal_recent()}>
		<h2 class="text-sm font-medium text-muted-foreground">{m.portal_recent()}</h2>
		{#each work.recent as order (order.id)}
			<WorkCard {order} when={{ date: order.completedAt, show: "date" }} />
		{/each}
	</section>
{/if}
