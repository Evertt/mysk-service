<!--
	@component
	The customer form, for creating (`createCustomer`) and editing (`updateCustomer`, with
	`customer`) a customer. The code is generated on create and can't be changed.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { countryOptions } from "#lib/components/customers/countries.js";
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
		if (await submit()) toast.success(customer ? m.customers_saved() : m.customers_created());
	})}
	class="flex flex-col gap-6"
>
	{#if customer}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateCustomer).fields.id.as("hidden", String(customer.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.customers_form_company()}</Card.Title>
			<Card.Description>
				{customer
					? m.customers_form_code_kept({ code: customer.code })
					: m.customers_form_code_assigned()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.name}
					label={m.customers_field_name()}
					value={customer?.name}
					autocomplete="organization"
				/>
				<SelectField
					field={fields.segment}
					label={m.customers_column_segment()}
					value={customer?.segment ?? "small_business"}
					options={segmentOptions.map(({ value, label }) => ({ value, label }))}
				/>
				<TextField
					field={fields.city}
					label={m.customers_field_city()}
					value={customer?.city}
					autocomplete="address-level2"
				/>
				<SelectField
					field={fields.country}
					label={m.customers_column_country()}
					placeholder={m.customers_country_required()}
					value={customer?.country}
					options={countryOptions(options.countries)}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.customers_column_contact()}</Card.Title>
			<Card.Description>{m.customers_form_contact_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.contactName}
					label={m.customers_field_contact_name()}
					value={customer?.contactName}
					autocomplete="name"
					class="md:col-span-2"
				/>
				<TextField
					field={fields.email}
					label={m.customers_field_email()}
					type="email"
					value={customer?.email}
					autocomplete="email"
				/>
				<TextField
					field={fields.phone}
					label={m.customers_field_phone()}
					type="tel"
					value={customer?.phone}
					autocomplete="tel"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={customer ? m.customers_save() : m.customers_create()}
		{cancelHref}
	/>
</form>
