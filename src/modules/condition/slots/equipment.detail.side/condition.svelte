<!--
	@component
	The condition module's card on a unit of equipment's page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): the unit's current score on NEN 2767's scale (the worst of its
	own latest condition and its components') and status, how its condition went (each condition
	with its defects), and "Record condition".
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";

	import { getUnitCondition } from "../../condition.remote.ts";
	import ConditionHistory from "../../detail/condition-history.svelte";
	import RecordDialog from "../../detail/record-dialog.svelte";
	import ScoreBadge from "../../ui/score-badge.svelte";
	import StatusBadge from "../../ui/status-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitCondition(serialNumber));
	// A number, so a refresh that answers the same unit keeps watching it.
	const unitId = $derived(data.unit.id);
	// Logged on the unit: a condition recorded or a component changed, here or elsewhere.
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unitId }),
		() => getUnitCondition(serialNumber).refresh(),
	);
	let recording = $state(false);
</script>

<Card.Root data-unit-condition>
	<Card.Header>
		<Card.Title>{m.condition_card_title()}</Card.Title>
		<Card.Description>{m.condition_card_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (recording = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.condition_record()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<ScoreBadge score={data.score} />
			<StatusBadge status={data.status} concern={data.concern} />
		</div>
		{#if data.history.length}
			<div class="flex flex-col gap-2">
				<h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{m.condition_history()}
				</h3>
				<ConditionHistory history={data.history} thresholds={data.thresholds} />
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.condition_card_none()}</p>
		{/if}
	</Card.Content>
</Card.Root>

<RecordDialog unit={data.unit} components={data.components} bind:open={recording} />
