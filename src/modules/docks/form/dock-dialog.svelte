<!--
	@component
	Adds a dock at one of a customer's sites, or edits one (`dock`): its code and position, its
	location, door and leveller (of the chosen site), and its Salvo parts.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import { type getCustomerDocks, saveCustomerDock } from "../docks.remote.ts";

	type CustomerDocks = Awaited<ReturnType<typeof getCustomerDocks>>;

	let {
		data,
		dock,
	}: {
		data: CustomerDocks;
		/** The dock to edit; a new one without. */
		dock?: CustomerDocks["docks"][number];
	} = $props();

	let open = $state(false);
	const form = $derived(saveCustomerDock.for(dock ? String(dock.id) : "new"));
	// The site whose locations and units the selects offer.
	let siteId = $state<string>();
	const site = $derived(siteId ?? String(dock?.siteId ?? data.sites[0]?.id ?? ""));

	const siteOptions = $derived(
		data.sites.map((each) => ({ value: String(each.id), label: `${each.name}, ${each.city}` })),
	);
	const locationOptions = $derived(
		data.locations
			.filter((each) => String(each.siteId) === site)
			.map((each) => ({ value: String(each.id), label: each.name })),
	);
	const unitOptions = $derived(
		data.units
			.filter((each) => String(each.siteId) === site)
			.map((each) => ({
				value: String(each.id),
				label: `${each.name ?? each.serialNumber} (${each.category})`,
			})),
	);
	const value = (id: number | null | undefined) => (id ? String(id) : "");
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if dock}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.docks_edit_named({ code: dock.code })}
				>
					<PencilIcon />
				</Button>
			{:else}
				<Button {...props} variant="outline" size="sm">
					<PlusIcon data-icon="inline-start" />
					{m.docks_add()}
				</Button>
			{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{dock ? m.docks_edit_named({ code: dock.code }) : m.docks_add()}</Dialog.Title>
			<Dialog.Description>{data.customer.name}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submitted(submit)) {
					open = false;
					const saved = form.result?.code;
					if (saved) toast.success(m.docks_saved({ code: saved }));
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.customer.as("hidden", data.customer.code)} />
			{#if dock}
				<input {...form.fields.dockId.as("hidden", String(dock.id))} />
			{/if}
			<Field.FieldGroup>
				<SelectField
					field={form.fields.siteId}
					label={m.docks_form_site()}
					options={siteOptions}
					value={site}
					onchange={(chosen) => (siteId = chosen)}
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						field={form.fields.code}
						label={m.docks_form_code()}
						description={m.docks_form_code_hint()}
						value={dock?.code}
						placeholder="DOCK 05"
					/>
					<TextField
						field={form.fields.position}
						label={m.docks_form_position()}
						description={m.docks_form_position_hint()}
						value={dock?.position}
					/>
				</div>
				<SelectField
					field={form.fields.locationId}
					label={m.docks_form_location()}
					options={locationOptions}
					placeholder={m.docks_form_none()}
					value={value(dock?.locationId)}
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<SelectField
						field={form.fields.doorId}
						label={m.docks_form_door()}
						options={unitOptions}
						placeholder={m.docks_form_none()}
						value={value(dock?.doorId)}
					/>
					<SelectField
						field={form.fields.levellerId}
						label={m.docks_form_leveller()}
						options={unitOptions}
						placeholder={m.docks_form_none()}
						value={value(dock?.levellerId)}
					/>
				</div>
				<Field.FieldSet>
					<Field.FieldLegend variant="label">{m.docks_form_salvo()}</Field.FieldLegend>
					<Field.FieldDescription>{m.docks_form_salvo_hint()}</Field.FieldDescription>
					<div class="grid gap-4 sm:grid-cols-3">
						<TextField
							field={form.fields.scpCode}
							label={m.docks_form_scp()}
							value={dock?.scpCode}
							placeholder="SCP-05"
						/>
						<TextField
							field={form.fields.keyId}
							label={m.docks_form_key()}
							value={dock?.keyId}
							placeholder="SLV-K05"
						/>
						<TextField
							field={form.fields.keyStorageUnit}
							label={m.docks_form_key_storage()}
							value={dock?.keyStorageUnit}
							placeholder="KS-NOORD-1"
						/>
					</div>
				</Field.FieldSet>
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.common_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
