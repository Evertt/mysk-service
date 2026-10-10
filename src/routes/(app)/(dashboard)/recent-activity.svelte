<!--
	@component
	The dashboard's "Recent activity": the latest changes across the organization, with a link to
	the activity feed.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import ActivityList from "#lib/components/activity/activity-list.svelte";
	import { getRecentActivity } from "#lib/components/activity/activity.remote.ts";

	const entries = $derived(await getRecentActivity());
</script>

<Card.Root data-card="recent-activity">
	<Card.Header>
		<Card.Title>{m.activity_recent_title()}</Card.Title>
		<Card.Description>{m.activity_recent_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/activity")}
				>{m.activity_recent_all()}</Button
			>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<ActivityList {entries} label={m.activity_recent_label()} />
	</Card.Content>
</Card.Root>
