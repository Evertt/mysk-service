<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDateTime } from "#lib/i18n/index.ts";
	import { leadDayLimits } from "#modules/maintenance/model.ts";
	import {
		getMaintenanceSettings,
		saveMaintenanceSettings,
	} from "#modules/maintenance/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/maintenance/settings"> } = $props();

	const settings = $derived(await getMaintenanceSettings());
	const onOff = (value: boolean) => (value ? m.maintenance_on() : m.maintenance_off());
	const lastRun = $derived(
		settings.lastRunAt
			? m.maintenance_last_run_result({
					when: formatDateTime(settings.lastRunAt),
					orders: m.common_count_orders({ count: settings.lastRunOrders ?? 0 }),
				})
			: m.maintenance_last_run_never(),
	);
</script>

<svelte:head>
	<title>{m.maintenance_settings()} · {m.maintenance_title()}</title>
</svelte:head>

<PageHeader
	title={m.maintenance_settings_title()}
	description={m.maintenance_settings_description()}
	breadcrumbs={[
		{ label: m.maintenance_title(), href: resolve("/(app)/(modules)/maintenance") },
		{ label: m.maintenance_settings() },
	]}
/>

{#if settings.canManage}
	<form
		{...saveMaintenanceSettings.enhance(async ({ submit }) => {
			if (await submit()) toast.success(m.maintenance_settings_saved());
		})}
		class="flex max-w-2xl flex-col gap-6"
	>
		<Card.Root>
			<Card.Content>
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
			</Card.Content>
			<Card.Footer>
				<dl><DetailItem label={m.maintenance_last_run()} value={lastRun} /></dl>
			</Card.Footer>
		</Card.Root>
		<FormActions
			pending={saveMaintenanceSettings.pending}
			submitLabel={m.maintenance_save_settings()}
			cancelHref={resolve("/(app)/(modules)/maintenance")}
		/>
	</form>
{:else}
	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Description>{m.maintenance_settings_managers()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-3">
				<DetailItem label={m.maintenance_auto_create()} value={onOff(settings.autoCreate)} />
				<DetailItem
					label={m.maintenance_lead_days()}
					value={m.maintenance_days({ count: settings.leadDays })}
				/>
				<DetailItem
					label={m.maintenance_remind_customers()}
					value={onOff(settings.remindCustomers)}
				/>
				<DetailItem label={m.maintenance_last_run()} value={lastRun} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
