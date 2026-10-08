<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { toDateInput } from "#lib/dates.ts";
	import { formatDate } from "#lib/format.ts";

	import { formatRate } from "../../../../display.ts";
	import { getInvoicingSettings, saveSettings } from "./settings.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/invoices/settings"> } = $props();

	const settings = $derived(await getInvoicingSettings());
</script>

<svelte:head>
	<title>{m.invoices_settings()} · {m.invoices_title()}</title>
</svelte:head>

<PageHeader
	title={m.invoices_settings_title()}
	description={m.invoices_settings_description()}
	breadcrumbs={[
		{ label: m.invoices_title(), href: resolve("/(app)/invoices") },
		{ label: m.invoices_settings() },
	]}
/>

{#if settings.canManage}
	<form
		{...saveSettings.enhance(async ({ submit }) => {
			if (await submit()) toast.success(m.invoices_settings_saved());
		})}
		class="flex max-w-2xl flex-col gap-6"
	>
		<Card.Root>
			<Card.Content>
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
						value={toDateInput(settings.billFrom)}
						description={m.invoices_bill_from_description()}
					/>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>
		<FormActions
			pending={saveSettings.pending}
			submitLabel={m.invoices_save_settings()}
			cancelHref={resolve("/(app)/invoices")}
		/>
	</form>
{:else}
	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Description>{m.invoices_settings_managers()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid grid-cols-3 gap-4">
				<DetailItem label={m.invoices_vat_rate()} value={formatRate(settings.vatRate)} />
				<DetailItem
					label={m.invoices_payment_term()}
					value={m.invoices_days({ count: settings.paymentTermDays })}
				/>
				<DetailItem label={m.invoices_bill_from()} value={formatDate(settings.billFrom)} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
