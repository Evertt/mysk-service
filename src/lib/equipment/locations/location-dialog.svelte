<!--
	@component
	Adds a location to a site, or renames (and describes) one of a site's locations.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
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

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{location
					? m.equipment_location_edit_title({ name: location.name })
					: m.equipment_location_new_title()}
			</Dialog.Title>
			<Dialog.Description>{m.equipment_location_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ element, submit }) => {
				if (!(await submitted(submit))) return;
				open = false;
				if (!location) element.reset();
				toast.success(m.equipment_location_saved());
			})}
			class="flex flex-col gap-6"
		>
			{#if location}
				<input
					{...editLocation.for(String(location.id)).fields.id.as("hidden", String(location.id))}
				/>
			{:else}
				<input {...addLocation.for(`site-${siteId}`).fields.siteId.as("hidden", String(siteId))} />
			{/if}
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
			<!-- E.g. when the location was deleted in the meantime. -->
			<Field.FieldError errors={fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.equipment_location_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
