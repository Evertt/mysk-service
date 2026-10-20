<script lang="ts">
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatDate, formatPercent } from "#lib/i18n/index.ts";
	import ModuleSettingsPage from "#lib/modules/settings/module-settings-page.svelte";
	import { getInvoicingSettings, saveSettings } from "#modules/invoices/settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/invoices/settings"> } = $props();

	const settings = $derived(await getInvoicingSettings());
</script>

<ModuleSettingsPage
	module="invoices"
	title={m.invoices_settings_title()}
	description={m.invoices_settings_description()}
	form={saveSettings}
>
	{#snippet fields()}
		<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
			<NumberField
				field={saveSettings.fields.vatRate}
				label={m.invoices_vat_rate_percent()}
				value={settings.vatRate}
				min={0}
				max={100}
				step={0.01}
				description={m.invoices_vat_rate_description()}
			/>
			<NumberField
				field={saveSettings.fields.paymentTermDays}
				label={m.invoices_payment_term_days()}
				value={settings.paymentTermDays}
				min={0}
				step={1}
				description={m.invoices_payment_term_description()}
			/>
			<TextField
				field={saveSettings.fields.billFrom}
				label={m.invoices_bill_from()}
				type="date"
				value={settings.billFrom.toString()}
				description={m.invoices_bill_from_description()}
			/>
		</Field.FieldGroup>
	{/snippet}
	{#snippet details()}
		<DetailItem
			label={m.invoices_vat_rate()}
			value={formatPercent(settings.vatRate, { basis: "percent" })}
		/>
		<DetailItem
			label={m.invoices_payment_term()}
			value={m.invoices_days({ count: settings.paymentTermDays })}
		/>
		<DetailItem label={m.invoices_bill_from()} value={formatDate(settings.billFrom)} />
	{/snippet}
</ModuleSettingsPage>
