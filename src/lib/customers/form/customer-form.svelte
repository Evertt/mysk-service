<!--
	@component
	The customer form, for creating (`createCustomer`) and editing (`updateCustomer`, with
	`customer`) a customer. The code is generated on create and can't be changed.
-->
<script lang="ts">
	import FormSection from "#lib/components/form/form-section.svelte";
	import RecordForm from "#lib/components/form/record-form.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { countryOptions } from "../countries.ts";
	import type {
		createCustomer,
		getCustomer,
		getCustomerFormOptions,
		updateCustomer,
	} from "../customers.remote.ts";
	import { segmentOptions } from "../display.ts";

	type Options = Awaited<ReturnType<typeof getCustomerFormOptions>>;
	type Customer = Awaited<ReturnType<typeof getCustomer>>["customer"];

	// A new customer's form has their first site's fields too.
	let props: { options: Options; cancelHref: string } & (
		| { form: typeof createCustomer; customer?: undefined }
		| { form: typeof updateCustomer; customer: Customer }
	) = $props();

	const { form, customer, options, cancelHref } = $derived(props);
	const fields = $derived(form.fields);
</script>

<RecordForm
	{form}
	record={customer}
	snapshot="customer"
	submitLabel={customer ? m.customers_save() : m.customers_create()}
	done={customer ? m.customers_saved() : m.customers_created()}
	{cancelHref}
>
	<FormSection
		title={m.customers_form_company()}
		description={customer
			? m.customers_form_code_kept({ code: customer.code })
			: m.customers_form_code_assigned()}
	>
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
		{#if !props.customer}
			<!-- Their first site's: a customer's sites are on their page after that. -->
			<TextField
				field={props.form.fields.address}
				label={m.customers_field_address()}
				autocomplete="street-address"
				description={m.customers_form_first_site()}
				class="md:col-span-2"
			/>
			<TextField
				field={props.form.fields.postalCode}
				label={m.customers_field_postal_code()}
				autocomplete="postal-code"
			/>
		{/if}
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
	</FormSection>

	<FormSection
		title={m.customers_column_contact()}
		description={m.customers_form_contact_description()}
	>
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
	</FormSection>
</RecordForm>
