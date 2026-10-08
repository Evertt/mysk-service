<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";

	import BillablePicker from "../billable-picker.svelte";
	import { createInvoice, getBillable, getInvoiceCustomers } from "../invoices.remote.js";

	const customers = $derived(await getInvoiceCustomers());

	// `?customer=<code>` (e.g. from an order's page) chooses the customer to start with.
	const requested = $derived(
		customers.find((c) => c.code === page.url.searchParams.get("customer")),
	);
	let customerId = $derived(requested ? String(requested.id) : "");

	// A form per customer, so each starts with all of that customer's orders and items checked.
	const form = $derived(createInvoice.for(customerId || "none"));
	const billable = $derived(customerId ? await getBillable(Number(customerId)) : undefined);
</script>

<svelte:head>
	<title>{m.invoices_new()} · {m.invoices_title()}</title>
</svelte:head>

<PageHeader
	title={m.invoices_new()}
	description={m.invoices_new_description()}
	breadcrumbs={[
		{ label: m.invoices_title(), href: resolve("/(app)/invoices") },
		{ label: m.invoices_new_breadcrumb() },
	]}
/>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the draft; otherwise the form shows what's wrong.
		if (await submit()) toast.success(m.invoices_draft_created());
	})}
	class="flex flex-col gap-6"
>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.invoices_column_customer()}</Card.Title>
			<Card.Description>{m.invoices_customer_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<SelectField
				field={form.fields.customerId}
				label={m.invoices_column_customer()}
				placeholder={m.invoices_customer_required()}
				value={customerId}
				options={customers.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
				onchange={(value: string) => (customerId = value)}
				class="max-w-md"
			/>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.invoices_what_to_bill()}</Card.Title>
			<Card.Description>
				{billable ? m.invoices_what_to_bill_description() : m.invoices_what_to_bill_choose()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if billable}
				<BillablePicker {billable} orderIds={form.fields.orderIds} items={form.fields.items} />
			{/if}
		</Card.Content>
	</Card.Root>

	<Field.FieldError errors={form.fields.issues()} />
	<FormActions
		pending={form.pending}
		submitLabel={m.invoices_create_draft()}
		cancelHref={resolve("/(app)/invoices")}
	/>
</form>
