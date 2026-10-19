<!--
	@component
	The "Activity" card on a record's page: the latest changes to it (and to its parts, e.g. an
	order's lines), with a link to all of them in the activity feed.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

	import type { LoggedType } from "#lib/activity/index.ts";

	import ActivityList from "./activity-list.svelte";
	import { getSubjectActivity } from "./activity.remote.ts";

	let {
		type,
		id,
		description = m.activity_card_description(),
	}: {
		/** The subject type, e.g. `order` (see `#lib/activity/subjects.ts`). */
		type: LoggedType;
		id: string | number;
		description?: string;
	} = $props();

	const all = $derived(
		`${resolve("/(app)/activity")}?${new URLSearchParams({ type, id: String(id) })}`,
	);
</script>

<Card.Root data-card="activity">
	<Card.Header>
		<Card.Title>{m.activity_title()}</Card.Title>
		<Card.Description>{description}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={all}>
				{m.activity_card_view_all()}
				<ArrowRightIcon data-icon="inline-end" />
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<!-- Loads on its own, so the page doesn't wait for it. -->
		<svelte:boundary>
			<ActivityList
				entries={await getSubjectActivity({ type, id: String(id) })}
				label={m.activity_log()}
				empty={m.activity_card_empty()}
			/>
			{#snippet pending()}
				<Skeleton class="h-16 w-full" />
			{/snippet}
		</svelte:boundary>
	</Card.Content>
</Card.Root>
