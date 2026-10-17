<!--
	@component
	Below a unit's checklist on the engineer portal (`checklists.field.checklist`, the checklists
	module's `api/extensions.ts`): once the checklist is completed, how the unit is doing, its
	condition score and advice, recorded on this order. Nothing while the checklist is a draft.
-->
<script lang="ts">
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import { toast } from "svelte-sonner";

	import { formatNumber } from "#lib/i18n/index.ts";
	import { errorMessage } from "#lib/utils.ts";

	import { scoreBand, scoreLimits } from "../../model.ts";
	import {
		getFieldCondition,
		recordFieldConditionForm,
	} from "../../portal/field-condition.remote.ts";
	import ConditionBar from "../../ui/condition-bar.svelte";

	let {
		number,
		equipmentId,
		completed,
	}: { number: string; equipmentId: number; completed: boolean; canChange: boolean } = $props();

	const data = $derived(completed ? await getFieldCondition({ number, equipmentId }) : null);
	const form = $derived(recordFieldConditionForm.for(`${number}-${equipmentId}`));
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
		{#if data.latest}
			<div class="flex flex-col gap-1" data-recorded>
				<ConditionBar
					score={data.latest.score}
					band={scoreBand(data.latest.score, data.thresholds)}
				/>
				{#if data.latest.advice}
					<p class="text-sm">{data.latest.advice}</p>
				{/if}
			</div>
		{/if}
		{#if data.canChange}
			<p class="text-sm text-muted-foreground">
				{data.latest
					? m.condition_portal_recorded({ score: `${formatNumber(data.latest.score)}%` })
					: m.condition_portal_ask()}
			</p>
			<form
				{...form.enhance(async ({ element, submit }) => {
					try {
						if (!(await submit())) return;
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
						return;
					}
					element.reset();
					toast.success(m.condition_recorded_toast());
				})}
				class="flex flex-col gap-3"
			>
				<input {...form.fields.number.as("hidden", number)} />
				<input {...form.fields.equipmentId.as("hidden", String(equipmentId))} />
				<div class="flex flex-col gap-2">
					<Label for="score-{equipmentId}">{m.condition_field_score()}</Label>
					<Input
						id="score-{equipmentId}"
						class="h-12 text-base tabular-nums"
						inputmode="numeric"
						min={scoreLimits.min}
						max={scoreLimits.max}
						step={1}
						{...form.fields.score.as("number")}
					/>
					{#each form.fields.score.issues() ?? [] as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>
				<div class="flex flex-col gap-2">
					<Label for="advice-{equipmentId}">{m.condition_field_advice()}</Label>
					<Textarea
						id="advice-{equipmentId}"
						rows={2}
						placeholder={m.condition_advice_placeholder()}
						{...form.fields.advice.as("text")}
					/>
					{#each form.fields.advice.issues() ?? [] as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>
				<Button type="submit" size="lg" class="h-12 text-base" disabled={!!form.pending}>
					{data.latest ? m.condition_portal_again() : m.condition_save()}
				</Button>
			</form>
		{/if}
	</section>
{/if}
