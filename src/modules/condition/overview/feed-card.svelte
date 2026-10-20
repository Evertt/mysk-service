<!--
	@component
	The service history of the units ("Activiteitenlog"): of all of them, or of a customer's (by
	code), newest first, as the activity log has it (`../server/history.ts`): the orders and
	checklists completed and the conditions recorded, with what they found and the advice.
-->
<script lang="ts">
	import ActivityList from "#lib/components/activity/activity-list.svelte";

	import { getServiceHistory } from "../feed.remote.ts";

	let {
		customer,
		limit = 12,
	}: {
		/** The customer's code; every customer's units without one. */
		customer: string | null;
		limit?: number;
	} = $props();

	const data = $derived(await getServiceHistory({ customer, limit }));
</script>

<Card.Root data-service-history>
	<Card.Header>
		<Card.Title>{m.condition_feed_title()}</Card.Title>
		<Card.Description>
			{data.customer
				? m.condition_feed_description_customer({ name: data.customer })
				: m.condition_feed_description()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<ActivityList
			entries={data.entries}
			label={m.condition_feed_list()}
			empty={m.condition_feed_empty()}
		/>
	</Card.Content>
</Card.Root>
