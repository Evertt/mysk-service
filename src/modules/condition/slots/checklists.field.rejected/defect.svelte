<!--
	@component
	Below a rejected point of a unit's checklist on the engineer portal (`checklists.field.rejected`,
	the checklists module's `api/extensions.ts`), while it's a draft: the point's defect on NEN 2767's
	scales, its severity ("ernst"), extent ("omvang") and intensity ("intensiteit") as chips, the
	score they give it, and photos of it. Saved with its button; the photos already saved show with a
	button that takes each off. When the checklist is completed, the defect is the condition's.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SaveIcon from "@lucide/svelte/icons/save";
	import XIcon from "@lucide/svelte/icons/x";
	import { toast } from "svelte-sonner";

	import FilterChips from "#lib/components/filter-chips.svelte";
	import { ran, submitted } from "#lib/components/form/submitted.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { extentLabel } from "../../display.ts";
	import { conditionLabels } from "../../labels.ts";
	import {
		type DefectExtent,
		defectExtents,
		type DefectIntensity,
		defectIntensities,
		defectScore,
		type DefectSeverity,
		defectSeverities,
	} from "../../nen2767.ts";
	import { MAX_DEFECT_PHOTOS } from "../../photos.ts";
	import {
		getFieldPointDefect,
		removeFieldPointPhoto,
		saveFieldPointDefectForm,
	} from "../../portal/field-condition.remote.ts";
	import DefectPhotosPicker from "../../ui/defect-photos-picker.svelte";
	import ScoreBadge from "../../ui/score-badge.svelte";

	let { number, equipmentId, pointId }: { number: string; equipmentId: number; pointId: number } =
		$props();

	const data = $derived(await getFieldPointDefect({ number, equipmentId, pointId }));
	const form = $derived(saveFieldPointDefectForm.for(`${pointId}`));

	// What the engineer picks, from what's saved.
	let severity = $derived<DefectSeverity | null>(data.defect?.severity ?? null);
	let extent = $derived<number | null>(data.defect?.extent ?? null);
	let intensity = $derived<DefectIntensity | null>(data.defect?.intensity ?? null);
	let photos = $state<File[]>([]);

	const score = $derived(
		severity && extent && intensity
			? defectScore({ severity, extent: extent as DefectExtent, intensity })
			: null,
	);
	const saved = $derived(
		!!data.defect &&
			data.defect.severity === severity &&
			data.defect.extent === extent &&
			data.defect.intensity === intensity &&
			!photos.length,
	);
	const id = $props.id();
</script>

{#if data.canChange}
	<form
		{...form.enhance(async ({ submit }) => {
			if (!(await submitted(submit))) return;
			photos = [];
			toast.success(m.condition_point_defect_saved_toast());
		})}
		class="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3"
		aria-labelledby="{id}-title"
		data-point-defect={pointId}
	>
		<div class="flex items-center justify-between gap-2">
			<h4 class="text-sm font-semibold" id="{id}-title">{m.condition_point_defect_title()}</h4>
			<ScoreBadge {score} />
		</div>
		<input {...form.fields.number.as("hidden", number)} />
		<input {...form.fields.equipmentId.as("hidden", String(equipmentId))} />
		<input {...form.fields.pointId.as("hidden", String(pointId))} />
		<input {...form.fields.severity.as("hidden", severity ?? "")} />
		<input {...form.fields.extent.as("hidden", extent === null ? "" : String(extent))} />
		<input {...form.fields.intensity.as("hidden", intensity ?? "")} />
		<FilterChips
			label={m.condition_defect_severity()}
			showLabel
			options={defectSeverities.map((value) => ({
				value,
				label: conditionLabels.label("defectSeverity", value),
			}))}
			value={severity}
			onchange={(value) => (severity = value as DefectSeverity | null)}
			data-defect-severity
		/>
		<FilterChips
			label={m.condition_defect_extent()}
			showLabel
			options={defectExtents.map((value) => ({ value: String(value), label: extentLabel(value) }))}
			value={extent === null ? null : String(extent)}
			onchange={(value) => (extent = value === null ? null : Number(value))}
			data-defect-extent
		/>
		<FilterChips
			label={m.condition_defect_intensity()}
			showLabel
			options={defectIntensities.map((value) => ({
				value,
				label: conditionLabels.label("defectIntensity", value),
			}))}
			value={intensity}
			onchange={(value) => (intensity = value as DefectIntensity | null)}
			data-defect-intensity
		/>
		{#each [form.fields.severity, form.fields.extent, form.fields.intensity] as field, index (index)}
			{#each field.issues() ?? [] as issue (issue.message)}
				<p class="text-sm text-destructive">{issue.message}</p>
			{/each}
		{/each}
		{#if data.photos.length}
			<ul class="flex flex-wrap gap-2" aria-label={m.condition_photos()}>
				{#each data.photos as photo, index (photo.id)}
					{@const src = resolve("/(field)/(modules)/condition/photos/[id]", {
						id: String(photo.id),
					})}
					<li class="relative">
						<img
							{src}
							alt={m.condition_photo_alt({ number: formatNumber(index + 1) })}
							class="size-16 rounded-md border object-cover"
							data-defect-photo={photo.id}
						/>
						<Button
							type="button"
							variant="secondary"
							size="icon-sm"
							class="absolute -top-1 -right-1 rounded-full"
							aria-label={m.condition_photo_remove({ number: formatNumber(index + 1) })}
							onclick={() =>
								ran(
									removeFieldPointPhoto({ number, equipmentId, pointId, photoId: photo.id }),
									m.condition_photo_remove_failed(),
								)}
						>
							<XIcon />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
		<DefectPhotosPicker
			field={form.fields.photos}
			bind:photos
			max={MAX_DEFECT_PHOTOS - data.photos.length}
		/>
		<Button
			type="submit"
			variant={saved ? "outline" : "default"}
			class="h-11"
			disabled={!score || saved || !!form.pending}
		>
			<SaveIcon data-icon="inline-start" />
			{saved ? m.condition_point_defect_saved() : m.condition_point_defect_save()}
		</Button>
	</form>
{/if}
