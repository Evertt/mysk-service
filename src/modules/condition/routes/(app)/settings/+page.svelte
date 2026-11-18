<script lang="ts">
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import { formatDateTime, formatNumber, formatOnOff } from "#lib/i18n/index.ts";
	import ModuleSettingsPage from "#lib/modules/settings/module-settings-page.svelte";
	import { scoreText } from "#modules/condition/display.ts";
	import { PLAN_WITHIN_WORKING_DAYS, thresholdLimits } from "#modules/condition/model.ts";
	import {
		getConditionSettings,
		saveConditionSettings,
	} from "#modules/condition/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/condition/settings"> } = $props();

	const settings = $derived(await getConditionSettings());
	const autoPlanDescription = $derived(
		m.condition_auto_plan_description({ days: formatNumber(PLAN_WITHIN_WORKING_DAYS) }),
	);
	const lastRun = $derived(
		settings.lastRunAt
			? m.condition_last_run_result({
					when: formatDateTime(settings.lastRunAt),
					orders: m.common_count_orders({ count: settings.lastRunOrders ?? 0 }),
				})
			: m.condition_last_run_never(),
	);
</script>

<ModuleSettingsPage
	module="condition"
	title={m.condition_settings_title()}
	description={m.condition_settings_description()}
	form={saveConditionSettings}
>
	{#snippet fields()}
		<Field.FieldGroup>
			<div class="grid gap-4 sm:grid-cols-2">
				<NumberField
					field={saveConditionSettings.fields.criticalFrom}
					label={m.condition_critical_from()}
					value={settings.criticalFrom}
					min={thresholdLimits.min}
					max={thresholdLimits.max}
					step={1}
					description={m.condition_critical_from_description()}
				/>
				<NumberField
					field={saveConditionSettings.fields.attentionFrom}
					label={m.condition_attention_from()}
					value={settings.attentionFrom}
					min={thresholdLimits.min}
					max={thresholdLimits.max}
					step={1}
					description={m.condition_attention_from_description()}
				/>
			</div>
			<CheckboxField
				field={saveConditionSettings.fields.autoPlan}
				label={m.condition_auto_plan()}
				checked={settings.autoPlan}
				description={autoPlanDescription}
			/>
		</Field.FieldGroup>
	{/snippet}
	{#snippet footer()}
		<dl><DetailItem label={m.condition_last_run()} value={lastRun} /></dl>
	{/snippet}
	{#snippet details()}
		<DetailItem label={m.condition_critical_from()} value={scoreText(settings.criticalFrom)} />
		<DetailItem label={m.condition_attention_from()} value={scoreText(settings.attentionFrom)} />
		<DetailItem label={m.condition_auto_plan()} value={formatOnOff(settings.autoPlan)} />
		<DetailItem label={m.condition_last_run()} value={lastRun} />
	{/snippet}
</ModuleSettingsPage>
