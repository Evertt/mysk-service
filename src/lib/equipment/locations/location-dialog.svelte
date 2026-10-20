<!--
	@component
	Adds a location to a site, or renames (and describes) one of a site's locations.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { addLocation, editLocation } from "./locations.remote.ts";

	let {
		siteId,
		location,
		open = $bindable(false),
	}: {
		/** The site a new location is for. */
		siteId: number;
		/** The location to edit; a new one if not given. */
		location?: { id: number; name: string; description: string | null };
		open?: boolean;
	} = $props();

	const form = $derived(
		location ? editLocation.for(String(location.id)) : addLocation.for(`site-${siteId}`),
	);
	const fields = $derived(form.fields);
</script>

<FormDialog
	{form}
	title={location
		? m.equipment_location_edit_title({ name: location.name })
		: m.equipment_location_new_title()}
	description={m.equipment_location_dialog_description()}
	submitLabel={m.equipment_location_save()}
	hidden={location ? { id: String(location.id) } : { siteId: String(siteId) }}
	reset={!location}
	done={m.equipment_location_saved()}
	class="sm:max-w-lg"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={fields.name}
			label={m.equipment_location_field_name()}
			value={location?.name}
			autocomplete="off"
			description={m.equipment_location_field_name_description()}
		/>
		<TextField
			field={fields.description}
			label={m.equipment_location_field_description()}
			value={location?.description}
			multiline
			description={m.equipment_location_field_description_description()}
		/>
	</Field.FieldGroup>
</FormDialog>
