<!--
	@component
	Below a unit's checklist on the engineer portal (`checklists.field.checklist`, the checklists
	module's `api/extensions.ts`): once the checklist is completed, the condition score it gave the
	unit (worked out from its points) and the engineer's advice on it, while the order is in
	progress. Nothing while the checklist is a draft.
-->
<script lang="ts">
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import { toast } from "svelte-sonner";

	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { scoreBand } from "../../model.ts";
	import {
		adviseFieldConditionForm,
		getFieldCondition,
	} from "../../portal/field-condition.remote.ts";
	import ConditionBar from "../../ui/condition-bar.svelte";

	let {
		number,
		equipmentId,
		completed,
	}: { number: string; equipmentId: number; completed: boolean; canChange: boolean } = $props();

	const data = $derived(completed ? await getFieldCondition({ number, equipmentId }) : null);
	// Logged on the unit: the engineer's advice.
	refreshOnRecordChange(
		() => completed && { type: "equipment", id: equipmentId },
		() => getFieldCondition({ number, equipmentId }).refresh(),
	);
	const form = $derived(adviseFieldConditionForm.for(`${number}-${equipmentId}`));
</script>

{#if data}
	<section
		class="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4"
		aria-label={m.condition_portal_title()}
		data-field-condition
	>
		<h3 class="flex items-center gap-2 text-sm font-semibold">
			<GaugeIcon class="size-4" aria-hidden="true" />
			{m.condition_portal_title()}
		</h3>
		{#if data.recorded}
			<div class="flex flex-col gap-1" data-recorded={data.recorded.score}>
				<ConditionBar
					score={data.recorded.score}
					band={scoreBand(data.recorded.score, data.thresholds)}
				/>
				<p class="text-xs text-muted-foreground">{m.condition_portal_computed()}</p>
				{#if data.components.length}
					<ul
						class="flex flex-col gap-1.5 pt-1"
						aria-label={m.condition_portal_components()}
						data-field-components
					>
						{#each data.components as part (part.id)}
							<li class="flex items-center justify-between gap-2" data-component={part.number}>
								<span class="truncate text-sm">{part.name}</span>
								<ConditionBar score={part.score} band={scoreBand(part.score, data.thresholds)} />
							</li>
						{/each}
					</ul>
				{/if}
				{#if data.recorded.advice && !data.canChange}
					<p class="text-sm">{data.recorded.advice}</p>
				{/if}
			</div>
			{#if data.canChange}
				<p class="text-sm text-muted-foreground">{m.condition_portal_ask()}</p>
				<form
					{...form.enhance(async ({ submit }) => {
						if (!(await submitted(submit))) return;
						toast.success(m.condition_advised_toast());
					})}
					class="flex flex-col gap-3"
				>
					<input {...form.fields.number.as("hidden", number)} />
					<input {...form.fields.equipmentId.as("hidden", String(equipmentId))} />
					<div class="flex flex-col gap-2">
						<Label for="advice-{equipmentId}">{m.condition_field_advice()}</Label>
						<Textarea
							id="advice-{equipmentId}"
							rows={2}
							placeholder={m.condition_advice_placeholder()}
							{...form.fields.advice.as("text", data.recorded.advice ?? "")}
						/>
						{#each form.fields.advice.issues() ?? [] as issue (issue.message)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>
					<Button type="submit" size="lg" class="h-12 text-base" disabled={!!form.pending}>
						{m.condition_portal_advise()}
					</Button>
				</form>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground" data-no-score>{m.condition_portal_no_score()}</p>
		{/if}
	</section>
{/if}
