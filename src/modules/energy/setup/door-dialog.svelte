<!--
	@component
	Adds a monitored door to one of a site's zones, or edits one (`door`): its code (what the
	gateway's door events name it by, unique in the site), name and kind, the power lost while it's
	open, how long it may be open before it raises an alert, the temperatures either side, and the
	unit it is, if it's one of the site's (a dock's door shows the dock's state on its card).
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField, { type SelectOption } from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { energyLabels } from "../labels.ts";
	import { type DoorKind, doorKinds } from "../model.ts";
	import { saveEnergyDoor } from "./setup.remote.ts";

	let {
		siteId,
		zones,
		units,
		door,
	}: {
		siteId: number;
		zones: SelectOption[];
		units: SelectOption[];
		/** The door to edit; a new one without. */
		door?: {
			id: number;
			zoneId: number;
			code: string;
			name: string;
			kind: DoorKind;
			lossKw: number;
			thresholdMinutes: number;
			insideC: number | null;
			outsideC: number | null;
			equipmentId: number | null;
		};
	} = $props();

	let open = $state(false);
	const form = $derived(saveEnergyDoor.for(door ? String(door.id) : "new"));
	const kinds = $derived(energyLabels.labelOptions("doorKind", doorKinds));
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if door}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.energy_setup_door_edit({ code: door.code })}
				>
					<PencilIcon />
				</Button>
			{:else}
				<Button {...props} variant="outline" size="sm" disabled={!zones.length}>
					<PlusIcon data-icon="inline-start" />
					{m.energy_setup_door_add()}
				</Button>
			{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{door ? m.energy_setup_door_edit({ code: door.code }) : m.energy_setup_door_add()}
			</Dialog.Title>
			<Dialog.Description>{m.energy_setup_door_description()}</Dialog.Description>
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
			{#if door}
				<input {...form.fields.doorId.as("hidden", String(door.id))} />
			{/if}
			<Field.FieldGroup>
				<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
					<TextField
						field={form.fields.code}
						label={m.energy_setup_code()}
						value={door?.code}
						placeholder="D-05"
					/>
					<TextField field={form.fields.name} label={m.energy_setup_name()} value={door?.name} />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<SelectField
						field={form.fields.zoneId}
						label={m.energy_setup_zone()}
						options={zones}
						value={door ? String(door.zoneId) : zones[0]?.value}
					/>
					<SelectField
						field={form.fields.kind}
						label={m.energy_setup_kind()}
						options={kinds}
						value={door?.kind ?? "sectional"}
					/>
					<NumberField
						field={form.fields.lossKw}
						label={m.energy_setup_loss()}
						value={door?.lossKw}
						min={0}
						step="any"
					/>
					<NumberField
						field={form.fields.thresholdMinutes}
						label={m.energy_setup_minutes()}
						value={door?.thresholdMinutes ?? 10}
						min={1}
						step={1}
					/>
					<NumberField
						field={form.fields.insideC}
						label={m.energy_setup_inside()}
						value={door?.insideC}
						step="any"
					/>
					<NumberField
						field={form.fields.outsideC}
						label={m.energy_setup_outside()}
						value={door?.outsideC}
						step="any"
					/>
				</div>
				<SelectField
					field={form.fields.equipmentId}
					label={m.energy_setup_unit()}
					options={units}
					placeholder={m.energy_setup_no_unit()}
					value={door?.equipmentId ? String(door.equipmentId) : ""}
					description={m.energy_setup_door_unit_hint()}
				/>
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
