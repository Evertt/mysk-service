<!--
	@component
	Adds a zone to a site, or edits one (`zone`): its code (what the gateway names it by, unique in
	the site), name, floor and area.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { saveEnergyZone } from "./setup.remote.ts";

	let {
		siteId,
		zone,
	}: {
		siteId: number;
		/** The zone to edit; a new one without. */
		zone?: { id: number; code: string; name: string; floor: string | null; areaM2: number };
	} = $props();

	let open = $state(false);
	const form = $derived(saveEnergyZone.for(zone ? String(zone.id) : "new"));
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if zone}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.energy_setup_zone_edit({ code: zone.code })}
				>
					<PencilIcon />
				</Button>
			{:else}
				<Button {...props} variant="outline" size="sm">
					<PlusIcon data-icon="inline-start" />
					{m.energy_setup_zone_add()}
				</Button>
			{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{zone ? m.energy_setup_zone_edit({ code: zone.code }) : m.energy_setup_zone_add()}
			</Dialog.Title>
			<Dialog.Description>{m.energy_setup_zone_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) {
					open = false;
					toast.success(m.energy_setup_saved({ name: form.result?.code ?? "" }));
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.energySiteId.as("hidden", String(siteId))} />
			{#if zone}
				<input {...form.fields.zoneId.as("hidden", String(zone.id))} />
			{/if}
			<Field.FieldGroup>
				<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
					<TextField
						field={form.fields.code}
						label={m.energy_setup_code()}
						value={zone?.code}
						placeholder="Z-A"
					/>
					<TextField field={form.fields.name} label={m.energy_setup_name()} value={zone?.name} />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						field={form.fields.floor}
						label={m.energy_setup_floor()}
						value={zone?.floor}
						description={m.energy_setup_floor_hint()}
					/>
					<NumberField
						field={form.fields.areaM2}
						label={m.energy_setup_area()}
						value={zone?.areaM2}
						min={0}
						step={1}
					/>
				</div>
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
