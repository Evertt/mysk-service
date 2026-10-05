<!--
	@component
	The customer form, for creating (`createCustomer`) and editing (`updateCustomer`, with
	`customer`) a customer. The code is generated on create and can't be changed.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { segmentOptions } from "#lib/components/customers/display.js";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import type {
		createCustomer,
		getCustomer,
		getCustomerFormOptions,
		updateCustomer,
	} from "./customers.remote.js";

	type Options = Awaited<ReturnType<typeof getCustomerFormOptions>>;
	type Customer = Awaited<ReturnType<typeof getCustomer>>["customer"];

	let {
		form,
		options,
		customer,
		cancelHref,
	}: {
		form: typeof createCustomer | typeof updateCustomer;
		options: Options;
		customer?: Customer;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the customer; otherwise the fields show what's wrong.
		if (await submit()) toast.success(customer ? "Customer saved" : "Customer created");
	})}
	class="flex flex-col gap-6"
>
	{#if customer}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateCustomer).fields.id.as("hidden", String(customer.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Company</Card.Title>
			<Card.Description>
				{customer
					? `Customer code ${customer.code} stays the same.`
					: "A customer code is assigned when the customer is created."}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.name}
					label="Name"
					value={customer?.name}
					autocomplete="organization"
				/>
				<SelectField
					field={fields.segment}
					label="Segment"
					value={customer?.segment ?? "small_business"}
					options={segmentOptions.map(({ value, label }) => ({ value, label }))}
				/>
				<TextField
					field={fields.city}
					label="City"
					value={customer?.city}
					autocomplete="address-level2"
				/>
				<SelectField
					field={fields.country}
					label="Country"
					placeholder="Choose a country"
					value={customer?.country}
					options={options.countries.map((country) => ({ value: country, label: country }))}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Contact</Card.Title>
			<Card.Description>Who we talk to about quotes, visits and invoices.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.contactName}
					label="Contact person"
					value={customer?.contactName}
					autocomplete="name"
					class="md:col-span-2"
				/>
				<TextField
					field={fields.email}
					label="Email"
					type="email"
					value={customer?.email}
					autocomplete="email"
				/>
				<TextField
					field={fields.phone}
					label="Phone"
					type="tel"
					value={customer?.phone}
					autocomplete="tel"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={customer ? "Save customer" : "Create customer"}
		{cancelHref}
	/>
</form>
