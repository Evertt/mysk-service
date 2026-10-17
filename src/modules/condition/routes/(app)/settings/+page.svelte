<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { PLAN_WITHIN_WORKING_DAYS } from "#modules/condition/model.ts";
	import {
		getConditionSettings,
		saveConditionSettings,
	} from "#modules/condition/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/condition/settings"> } = $props();

	const settings = $derived(await getConditionSettings());
	const onOff = (value: boolean) => (value ? m.condition_on() : m.condition_off());
	const percent = (value: number) => `${formatNumber(value)}%`;
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

<svelte:head>
	<title>{m.condition_settings()} · {m.condition_title()}</title>
</svelte:head>

<PageHeader
	title={m.condition_settings_title()}
	description={m.condition_settings_description()}
	breadcrumbs={[
		{ label: m.condition_title(), href: resolve("/(app)/(modules)/condition") },
		{ label: m.condition_settings() },
	]}
/>

{#if settings.canManage}
	<form
		{...saveConditionSettings.enhance(async ({ submit }) => {
			if (await submit()) toast.success(m.condition_settings_saved());
		})}
		class="flex max-w-2xl flex-col gap-6"
	>
		<Card.Root>
			<Card.Content>
				<Field.FieldGroup>
					<div class="grid gap-4 sm:grid-cols-2">
						<NumberField
							field={saveConditionSettings.fields.criticalBelow}
							label={m.condition_critical_below()}
							value={settings.criticalBelow}
							min={1}
							max={100}
							step={1}
							description={m.condition_critical_below_description()}
						/>
						<NumberField
							field={saveConditionSettings.fields.attentionBelow}
							label={m.condition_attention_below()}
							value={settings.attentionBelow}
							min={1}
							max={100}
							step={1}
							description={m.condition_attention_below_description()}
						/>
					</div>
					<CheckboxField
						field={saveConditionSettings.fields.autoPlan}
						label={m.condition_auto_plan()}
						checked={settings.autoPlan}
						description={autoPlanDescription}
					/>
				</Field.FieldGroup>
			</Card.Content>
			<Card.Footer>
				<dl><DetailItem label={m.condition_last_run()} value={lastRun} /></dl>
			</Card.Footer>
		</Card.Root>
		<FormActions
			pending={saveConditionSettings.pending}
			submitLabel={m.condition_save_settings()}
			cancelHref={resolve("/(app)/(modules)/condition")}
		/>
	</form>
{:else}
	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Description>{m.condition_settings_managers()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-3">
				<DetailItem label={m.condition_critical_below()} value={percent(settings.criticalBelow)} />
				<DetailItem
					label={m.condition_attention_below()}
					value={percent(settings.attentionBelow)}
				/>
				<DetailItem label={m.condition_auto_plan()} value={onOff(settings.autoPlan)} />
				<DetailItem label={m.condition_last_run()} value={lastRun} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
