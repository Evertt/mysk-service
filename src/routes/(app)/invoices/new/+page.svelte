<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";

	import BillablePicker from "../billable-picker.svelte";
	import { createInvoice, getBillable, getCustomers } from "../invoices.remote.js";

	const customers = $derived(await getCustomers());

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
	<title>New invoice · Invoices</title>
</svelte:head>

<PageHeader
	title="New invoice"
	description="Bill a customer for their completed orders and fees; it starts as a draft."
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/invoices")}>Invoices</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the draft; otherwise the form shows what's wrong.
		if (await submit()) toast.success("Draft invoice created");
	})}
	class="flex flex-col gap-6"
>
	<Card.Root>
		<Card.Header>
			<Card.Title>Customer</Card.Title>
			<Card.Description>Who the invoice is for.</Card.Description>
		</Card.Header>
		<Card.Content>
			<SelectField
				field={form.fields.customerId}
				label="Customer"
				placeholder="Choose a customer"
				value={customerId}
				options={customers.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
				onchange={(value: string) => (customerId = value)}
				class="max-w-md"
			/>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>What to bill</Card.Title>
			<Card.Description>
				{billable
					? "Completed orders that aren't invoiced yet, priced as on their page, and fees that are due."
					: "Choose a customer to see what they can be billed for."}
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
		submitLabel="Create draft"
		cancelHref={resolve("/(app)/invoices")}
	/>
</form>
