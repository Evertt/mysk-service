<script lang="ts">
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import { formatDateTime, formatOnOff } from "#lib/i18n/index.ts";
	import ModuleSettingsPage from "#lib/modules/settings/module-settings-page.svelte";
	import { leadDayLimits } from "#modules/maintenance/model.ts";
	import {
		getMaintenanceSettings,
		saveMaintenanceSettings,
	} from "#modules/maintenance/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/maintenance/settings"> } = $props();

	const settings = $derived(await getMaintenanceSettings());
	const lastRun = $derived(
		settings.lastRunAt
			? m.maintenance_last_run_result({
					when: formatDateTime(settings.lastRunAt),
					orders: m.common_count_orders({ count: settings.lastRunOrders ?? 0 }),
				})
			: m.maintenance_last_run_never(),
	);
</script>

<ModuleSettingsPage
	module="maintenance"
	title={m.maintenance_settings_title()}
	description={m.maintenance_settings_description()}
	canManage={settings.canManage}
	form={saveMaintenanceSettings}
>
	{#snippet fields()}
		<Field.FieldGroup>
			<CheckboxField
				field={saveMaintenanceSettings.fields.autoCreate}
				label={m.maintenance_auto_create()}
				checked={settings.autoCreate}
				description={m.maintenance_auto_create_description()}
			/>
			<NumberField
				field={saveMaintenanceSettings.fields.leadDays}
				label={m.maintenance_lead_days()}
				value={settings.leadDays}
				min={leadDayLimits.min}
				max={leadDayLimits.max}
				step={1}
				description={m.maintenance_lead_days_description()}
			/>
			<CheckboxField
				field={saveMaintenanceSettings.fields.remindCustomers}
				label={m.maintenance_remind_customers()}
				checked={settings.remindCustomers}
				description={m.maintenance_remind_customers_description()}
			/>
		</Field.FieldGroup>
	{/snippet}
	{#snippet footer()}
		<dl><DetailItem label={m.maintenance_last_run()} value={lastRun} /></dl>
	{/snippet}
	{#snippet details()}
		<DetailItem label={m.maintenance_auto_create()} value={formatOnOff(settings.autoCreate)} />
		<DetailItem
			label={m.maintenance_lead_days()}
			value={m.maintenance_days({ count: settings.leadDays })}
		/>
		<DetailItem
			label={m.maintenance_remind_customers()}
			value={formatOnOff(settings.remindCustomers)}
		/>
		<DetailItem label={m.maintenance_last_run()} value={lastRun} />
	{/snippet}
</ModuleSettingsPage>
