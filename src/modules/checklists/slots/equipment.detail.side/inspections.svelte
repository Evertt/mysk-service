<!--
	@component
	The checklists module's card of a unit's inspections and maintenance (`equipment.detail.side`):
	its inspection status by its latest completed inspection, and its checklists per year, newest
	first (date, kind, engineer, outcome), each opening its points and remarks.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { getUnitChecklists } from "../../checklists.remote.ts";
	import ChecklistHistory from "../../detail/checklist-history.svelte";
	import ChecklistPoints from "../../detail/checklist-points.svelte";
	import { completerName, inspectionStatusDisplay } from "../../display.ts";
	import { checklistLabels } from "../../labels.ts";
	import OutcomeBadge from "../../ui/outcome-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitChecklists(serialNumber));

	let openId = $state<number>();
	const opened = $derived(data.checklists.find((checklist) => checklist.id === openId));
	const openedBy = $derived(opened && completerName(opened));
</script>

<Card.Root data-unit-inspections>
	<Card.Header>
		<Card.Title>{m.checklists_unit_title()}</Card.Title>
		<Card.Description>
			{#if data.validUntil && data.status !== "expired"}
				{m.checklists_valid_until({ date: formatDate(data.validUntil) })}
			{:else if data.validUntil}
				{m.checklists_expired_on({ date: formatDate(data.validUntil) })}
			{:else}
				{m.checklists_unit_no_inspection()}
			{/if}
		</Card.Description>
		<Card.Action>
			<EnumBadge
				display={inspectionStatusDisplay}
				value={data.status}
				data-inspection={data.status}
			/>
		</Card.Action>
	</Card.Header>
	{#if data.checklists.length}
		<Card.Content>
			<ChecklistHistory
				checklists={data.checklists}
				onopen={(checklist) => (openId = checklist.id)}
			/>
		</Card.Content>
	{/if}
</Card.Root>

<Dialog.Root bind:open={() => openId !== undefined, (open) => !open && (openId = undefined)}>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
		{#if opened}
			<Dialog.Header>
				<Dialog.Title>
					{checklistLabels.label("checklistKind", opened.kind)} · {formatDate(opened.date)}
				</Dialog.Title>
				<Dialog.Description>
					{opened.name}{opened.norm ? ` · ${opened.norm}` : ""} ·
					<OrderLink number={opened.order.number} class="underline-offset-4 hover:underline" />
				</Dialog.Description>
			</Dialog.Header>
			<div class="flex items-center gap-2 text-sm">
				<OutcomeBadge checklist={opened} />
				{#if openedBy}
					<span class="text-muted-foreground">{openedBy}</span>
				{/if}
			</div>
			<ChecklistPoints results={opened.results} remarks={opened.remarks} />
		{/if}
	</Dialog.Content>
</Dialog.Root>
