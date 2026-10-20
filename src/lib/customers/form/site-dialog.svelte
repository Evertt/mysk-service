<!--
	@component
	Adds a site to a customer, or edits one of their sites: its address, who to ask for there, when
	a visit suits it and how to get in.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import {
		type ContactChannel,
		contactChannels,
		type SitePriority,
		sitePriorities,
		type Weekday,
		weekdays,
	} from "#lib/models.ts";

	import { countryOptions } from "../countries.ts";
	import { addCustomerSite, updateCustomerSite } from "../detail/sites.remote.ts";

	let {
		customer,
		site,
		countries,
		open = $bindable(false),
	}: {
		/** The customer a new site is for, whose city and country it starts with. */
		customer: { id: number; city: string; country: string };
		/** The site to edit; a new one if not given. */
		site?: {
			id: number;
			name: string;
			address: string;
			postalCode: string;
			city: string;
			country: string;
			contactName: string | null;
			contactPhone: string | null;
			contactEmail: string | null;
			contactChannel: ContactChannel | null;
			preferredDay: Weekday | null;
			slotStart: string | null;
			slotEnd: string | null;
			priority: SitePriority;
			accessNotes: string | null;
		};
		/** The countries to choose from (`getCustomerFormOptions`). */
		countries: string[];
		open?: boolean;
	} = $props();

	const form = $derived(
		site ? updateCustomerSite.for(String(site.id)) : addCustomerSite.for(`customer-${customer.id}`),
	);
	const fields = $derived(form.fields);
</script>

<FormDialog
	{form}
	title={site ? m.customers_site_edit_title({ name: site.name }) : m.customers_site_new_title()}
	description={m.customers_site_dialog_description()}
	submitLabel={m.customers_site_save()}
	hidden={site ? { id: String(site.id) } : { customerId: String(customer.id) }}
	done={m.customers_site_saved()}
	class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
	bind:open
>
	<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
		<TextField
			field={fields.name}
			label={m.customers_site_field_name()}
			value={site?.name}
			description={m.customers_site_field_name_description()}
		/>
		<SelectField
			field={fields.priority}
			label={m.customers_site_field_priority()}
			value={site?.priority ?? "normal"}
			options={labelOptions("sitePriority", sitePriorities)}
		/>
		<TextField
			field={fields.address}
			label={m.customers_field_address()}
			value={site?.address}
			autocomplete="street-address"
			class="md:col-span-2"
		/>
		<TextField
			field={fields.postalCode}
			label={m.customers_field_postal_code()}
			value={site?.postalCode}
			autocomplete="postal-code"
		/>
		<TextField
			field={fields.city}
			label={m.customers_field_city()}
			value={site?.city ?? customer.city}
			autocomplete="address-level2"
		/>
		<SelectField
			field={fields.country}
			label={m.customers_column_country()}
			placeholder={m.customers_country_required()}
			value={site?.country ?? customer.country}
			options={countryOptions(countries)}
		/>
	</Field.FieldGroup>

	<Field.Set>
		<Field.Legend>{m.customers_site_field_contact()}</Field.Legend>
		<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
			<TextField
				field={fields.contactName}
				label={m.customers_site_field_contact_name()}
				value={site?.contactName}
				autocomplete="off"
				class="md:col-span-2"
			/>
			<TextField
				field={fields.contactPhone}
				label={m.customers_site_field_contact_phone()}
				type="tel"
				value={site?.contactPhone}
				autocomplete="off"
			/>
			<TextField
				field={fields.contactEmail}
				label={m.customers_site_field_contact_email()}
				type="email"
				value={site?.contactEmail}
				autocomplete="off"
			/>
		</Field.FieldGroup>
	</Field.Set>

	<Field.Set>
		<Field.Legend>{m.customers_site_section_visit()}</Field.Legend>
		<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
			<SelectField
				field={fields.contactChannel}
				label={m.customers_site_field_channel()}
				placeholder={m.customers_site_no_preference()}
				value={site?.contactChannel}
				options={labelOptions("contactChannel", contactChannels)}
			/>
			<SelectField
				field={fields.preferredDay}
				label={m.customers_site_field_day()}
				placeholder={m.customers_site_no_preference()}
				value={site?.preferredDay}
				options={labelOptions("weekday", weekdays)}
			/>
			<TextField
				field={fields.slotStart}
				label={m.customers_site_field_slot_start()}
				type="time"
				value={site?.slotStart}
			/>
			<TextField
				field={fields.slotEnd}
				label={m.customers_site_field_slot_end()}
				type="time"
				value={site?.slotEnd}
			/>
			<TextField
				field={fields.accessNotes}
				label={m.customers_site_field_access_notes()}
				multiline
				value={site?.accessNotes}
				description={m.customers_site_field_access_notes_description()}
				class="md:col-span-2"
			/>
		</Field.FieldGroup>
	</Field.Set>
</FormDialog>
