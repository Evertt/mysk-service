<!--
	@component
	Records a unit's condition in the office, or one of its components' (`component`): its defects,
	each a row to add, change or take off again (what's wrong, the element it's on, its severity,
	extent and intensity on NEN 2767's scales, and photos), the score they give it (the worst defect
	wins, shown live; the server works it out again), and the advice that goes with it. No defects is
	score 1. A correction: it counts until a newer one, e.g. the next completed checklist's.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import { lineItems, withoutValue } from "#lib/components/form/line-items.svelte.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { recordCondition } from "../condition.remote.ts";
	import { extentLabel, scoreText } from "../display.ts";
	import { conditionLabels } from "../labels.ts";
	import { DEFECT_TEXT_MAX, DEFECTS_MAX } from "../model.ts";
	import {
		type DefectExtent,
		type DefectIntensity,
		defectExtents,
		defectIntensities,
		defectScore,
		type DefectSeverity,
		defectSeverities,
		worstScore,
	} from "../nen2767.ts";
	import DefectPhotosPicker from "../ui/defect-photos-picker.svelte";
	import ScoreBadge from "../ui/score-badge.svelte";

	interface Part {
		id: number;
		number: string;
		name: string;
	}

	let {
		unit,
		component,
		components = [],
		open = $bindable(false),
	}: {
		unit: { serialNumber: string; title: string };
		/** The component whose condition it is; none for the unit as a whole. */
		component?: Part;
		/** The unit's components, which a defect of the unit's condition may be on. */
		components?: readonly Part[];
		open?: boolean;
	} = $props();

	const form = $derived(
		recordCondition.for(component ? `${unit.serialNumber}-${component.id}` : unit.serialNumber),
	);

	interface Row {
		componentId: string;
		description: string;
		severity: DefectSeverity | "";
		extent: string;
		intensity: DefectIntensity | "";
		photos: File[];
	}
	const empty = (): Row => ({
		componentId: "",
		description: "",
		severity: "",
		extent: "",
		intensity: "",
		photos: [],
	});
	const rows = lineItems<Row>(() => []);

	/** A row's score, once its grade is complete. */
	const scoreOf = (row: Row) =>
		row.severity && row.extent && row.intensity
			? defectScore({
					severity: row.severity,
					extent: Number(row.extent) as DefectExtent,
					intensity: row.intensity,
				})
			: null;
	/** The score the defects give it so far: the worst. */
	const score = $derived(worstScore(rows.rows.flatMap((row) => scoreOf(row) ?? [])));
	const elements = $derived(component ? [] : components);
	const fields = $derived(form.fields.defects);
</script>

<FormDialog
	{form}
	title={component
		? m.condition_record_component_title({
				component: `${component.number} ${component.name}`,
			})
		: m.condition_record_title({ unit: unit.title })}
	description={component
		? m.condition_record_component_description()
		: m.condition_record_description()}
	submitLabel={m.condition_save()}
	hidden={{
		serialNumber: unit.serialNumber,
		componentId: component ? String(component.id) : "",
	}}
	reset
	ondone={() => (rows.rows = [])}
	done={m.condition_recorded_toast()}
	class="sm:max-w-2xl"
	bind:open
>
	<Field.FieldGroup>
		<div class="flex flex-wrap items-center justify-between gap-2" data-live-score={score}>
			<span class="text-sm font-medium">{m.condition_defects()}</span>
			<span class="flex items-center gap-2 text-sm text-muted-foreground">
				{m.condition_score_so_far()}
				<ScoreBadge {score} />
			</span>
		</div>
		{#if rows.rows.length}
			<ol class="flex flex-col gap-3">
				{#each rows.rows as row, index (row.key)}
					{@const field = fields[index]}
					{@const own = scoreOf(row)}
					<li class="flex flex-col gap-3 rounded-lg border p-3" data-defect={index}>
						<div class="flex items-start gap-2">
							<Field.Field
								class="flex-1"
								data-invalid={field.description.issues() ? true : undefined}
							>
								<Field.FieldLabel for="defect-{index}-description">
									{m.condition_defect_description()}
								</Field.FieldLabel>
								<Input
									id="defect-{index}-description"
									{...withoutValue(field.description.as("text"))}
									bind:value={row.description}
									maxlength={DEFECT_TEXT_MAX}
									placeholder={m.condition_defect_description_placeholder()}
								/>
								<Field.FieldError errors={field.description.issues()} />
							</Field.Field>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								class="mt-6"
								aria-label={m.condition_defect_remove({ number: formatNumber(index + 1) })}
								onclick={() => rows.remove(index)}
							>
								<Trash2Icon />
							</Button>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							{#if elements.length}
								<Field.Field>
									<Field.FieldLabel for="defect-{index}-element">
										{m.condition_defect_element()}
									</Field.FieldLabel>
									<NativeSelect.Root
										id="defect-{index}-element"
										class="w-full"
										{...withoutValue(field.componentId.as("select"))}
										bind:value={row.componentId}
									>
										<NativeSelect.Option value=""
											>{m.condition_defect_element_unit()}</NativeSelect.Option
										>
										{#each elements as part (part.id)}
											<NativeSelect.Option value={String(part.id)}>
												{part.number}
												{part.name}
											</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</Field.Field>
							{/if}
							<Field.Field data-invalid={field.severity.issues() ? true : undefined}>
								<Field.FieldLabel for="defect-{index}-severity">
									{m.condition_defect_severity()}
								</Field.FieldLabel>
								<NativeSelect.Root
									id="defect-{index}-severity"
									class="w-full"
									{...withoutValue(field.severity.as("select"))}
									bind:value={row.severity}
								>
									<NativeSelect.Option value="">{m.condition_choose()}</NativeSelect.Option>
									{#each defectSeverities as severity (severity)}
										<NativeSelect.Option value={severity}>
											{conditionLabels.label("defectSeverity", severity)}
										</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
								<Field.FieldError errors={field.severity.issues()} />
							</Field.Field>
							<Field.Field data-invalid={field.extent.issues() ? true : undefined}>
								<Field.FieldLabel for="defect-{index}-extent">
									{m.condition_defect_extent()}
								</Field.FieldLabel>
								<NativeSelect.Root
									id="defect-{index}-extent"
									class="w-full"
									{...withoutValue(field.extent.as("select"))}
									bind:value={row.extent}
								>
									<NativeSelect.Option value="">{m.condition_choose()}</NativeSelect.Option>
									{#each defectExtents as extent (extent)}
										<NativeSelect.Option value={String(extent)}>
											{formatNumber(extent)} · {extentLabel(extent)}
										</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
								<Field.FieldError errors={field.extent.issues()} />
							</Field.Field>
							<Field.Field data-invalid={field.intensity.issues() ? true : undefined}>
								<Field.FieldLabel for="defect-{index}-intensity">
									{m.condition_defect_intensity()}
								</Field.FieldLabel>
								<NativeSelect.Root
									id="defect-{index}-intensity"
									class="w-full"
									{...withoutValue(field.intensity.as("select"))}
									bind:value={row.intensity}
								>
									<NativeSelect.Option value="">{m.condition_choose()}</NativeSelect.Option>
									{#each defectIntensities as intensity (intensity)}
										<NativeSelect.Option value={intensity}>
											{conditionLabels.label("defectIntensity", intensity)}
										</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
								<Field.FieldError errors={field.intensity.issues()} />
							</Field.Field>
						</div>
						<div class="flex flex-wrap items-end justify-between gap-3">
							<DefectPhotosPicker field={field.photos} bind:photos={row.photos} />
							<span class="text-xs text-muted-foreground" data-defect-score={own}>
								{own === null ? m.condition_defect_incomplete() : scoreText(own)}
							</span>
						</div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-muted-foreground">{m.condition_defects_none()}</p>
		{/if}
		<div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={rows.rows.length >= DEFECTS_MAX}
				onclick={() => rows.add(empty())}
			>
				<PlusIcon data-icon="inline-start" />
				{m.condition_defect_add()}
			</Button>
		</div>
		<TextField
			field={form.fields.advice}
			label={m.condition_field_advice()}
			multiline
			placeholder={m.condition_advice_placeholder()}
			description={m.condition_advice_description()}
		/>
	</Field.FieldGroup>
</FormDialog>
