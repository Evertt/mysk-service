<script lang="ts">
	import { resolve } from "$app/paths";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatRate } from "#lib/components/invoicing/invoice.js";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDate } from "#lib/format.js";
	import { toDateInput } from "#lib/schema.js";

	import { getSettings, saveSettings } from "../invoices.remote.js";

	const settings = $derived(await getSettings());
</script>

<svelte:head>
	<title>Settings · Invoices</title>
</svelte:head>

<PageHeader title="Invoicing settings" description="What new invoices start with.">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/invoices")}>Invoices</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Settings</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

{#if settings.canManage}
	<form
		{...saveSettings.enhance(async ({ submit }) => {
			if (await submit()) toast.success("Settings saved");
		})}
		class="flex max-w-2xl flex-col gap-6"
	>
		<Card.Root>
			<Card.Content>
				<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
					<NumberField
						field={saveSettings.fields.vatRate}
						label="VAT rate (%)"
						value={settings.vatRate}
						min={0}
						max={100}
						step={0.01}
						description="Fixed on an invoice when it's issued."
					/>
					<NumberField
						field={saveSettings.fields.paymentTermDays}
						label="Payment term (days)"
						value={settings.paymentTermDays}
						min={0}
						step={1}
						description="For new drafts; each draft can have its own."
					/>
					<TextField
						field={saveSettings.fields.billFrom}
						label="Bill fees from"
						type="date"
						value={toDateInput(settings.billFrom)}
						description="Other modules' fees (e.g. service contracts) are billed from this day on."
					/>
				</Field.FieldGroup>
			</Card.Content>
		</Card.Root>
		<FormActions
			pending={saveSettings.pending}
			submitLabel="Save settings"
			cancelHref={resolve("/(app)/invoices")}
		/>
	</form>
{:else}
	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Description>Owners and admins can change these.</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid grid-cols-3 gap-4">
				<DetailItem label="VAT rate" value={formatRate(settings.vatRate)} />
				<DetailItem label="Payment term" value="{settings.paymentTermDays} days" />
				<DetailItem label="Bill fees from" value={formatDate(settings.billFrom)} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
