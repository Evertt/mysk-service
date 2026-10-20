<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { createCreditNote } from "#modules/invoices/credit-notes.remote.ts";
	import { getInvoiceCustomers } from "#modules/invoices/invoices.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/invoices/credit-notes/new"> } = $props();

	const customers = $derived(await getInvoiceCustomers());
	// `?customer=<code>` chooses the customer to start with.
	const requested = $derived(
		customers.find((c) => c.code === page.url.searchParams.get("customer")),
	);
</script>

<PageHeader
	title={m.invoices_credit_new()}
	description={m.invoices_credit_new_description()}
	breadcrumbs={[
		{ label: m.invoices_title(), href: resolve("/(app)/(modules)/invoices") },
		{ label: m.invoices_credit_notes(), href: resolve("/(app)/(modules)/invoices/credit-notes") },
		{ label: m.invoices_new_breadcrumb() },
	]}
/>

<form
	{...createCreditNote.enhance(async ({ submit }) => {
		// On success the server redirects to the draft; otherwise the form shows what's wrong.
		if (await submitted(submit)) toast.success(m.invoices_credit_created());
	})}
	class="flex max-w-2xl flex-col gap-6"
>
	<Card.Root>
		<Card.Content>
			<Field.FieldGroup>
				<SelectField
					field={createCreditNote.fields.customerId}
					label={m.invoices_column_customer()}
					placeholder={m.invoices_customer_required()}
					value={requested ? String(requested.id) : ""}
					options={customers.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
				/>
				<TextField
					field={createCreditNote.fields.reason}
					label={m.invoices_credit_reason()}
					description={m.invoices_credit_reason_description()}
				/>
				<TextField
					field={createCreditNote.fields.description}
					label={m.invoices_description_column()}
				/>
				<MoneyField
					field={createCreditNote.fields.amount}
					label={m.invoices_credit_amount()}
					description={m.invoices_credit_amount_description()}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Field.FieldError errors={createCreditNote.fields.issues()} />
	<FormActions
		pending={createCreditNote.pending}
		submitLabel={m.invoices_create_draft()}
		cancelHref={resolve("/(app)/(modules)/invoices/credit-notes")}
	/>
</form>
