<!--
	@component
	Adds a component to a unit, or changes one: its name, its article (one of the tenant's materials,
	with the materials module on, found by SKU or name) and the points of the unit's checklist that check it,
	grouped (with the checklists module on; without, it sends none and the server keeps the
	component's). Choosing an article checks the points its shop product fixes.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import type { Article, Checkpoint } from "../api/extensions.ts";
	import { saveComponent } from "../components.remote.ts";
	import ArticleField from "./article-field.svelte";

	interface Editing {
		id: number;
		number: string;
		name: string;
		article: Article | null;
		checkpointIds: number[];
	}

	let {
		open = $bindable(false),
		unit,
		editing,
		checkpoints,
		hasArticles,
		hasCheckpoints,
	}: {
		open?: boolean;
		unit: { serialNumber: string; title: string };
		/** The component being changed; none for a new one. */
		editing: Editing | null;
		checkpoints: Checkpoint[];
		/** Whether the tenant has materials, whose articles a component can have. */
		hasArticles: boolean;
		/** Whether the tenant has checklists, whose points check a component. */
		hasCheckpoints: boolean;
	} = $props();

	const form = $derived(saveComponent.for(editing ? `component-${editing.id}` : "component-new"));
	/** The points by template, then group, as the checklists module orders them. */
	const byTemplate = $derived(
		[...Map.groupBy(checkpoints, (point) => point.template)].map(([template, points]) => ({
			template,
			groups: [...Map.groupBy(points, (point) => point.group)].map(([group, inGroup]) => ({
				group,
				points: inGroup,
			})),
		})),
	);
	const offered = $derived(new Set(checkpoints.map((point) => point.id)));

	/** A chosen article checks the points its shop product fixes (those the unit has). */
	function chooseArticle(article: { checkpointIds: number[] } | null) {
		const points = article?.checkpointIds.filter((id) => offered.has(id));
		if (points?.length) form.fields.checkpointIds.set(points.map(String));
	}
</script>

<FormDialog
	{form}
	title={editing
		? m.condition_component_edit_title({ number: editing.number })
		: m.condition_component_add_title({ unit: unit.title })}
	description={m.condition_component_dialog_description()}
	hidden={{ serialNumber: unit.serialNumber, id: editing ? String(editing.id) : "" }}
	reset={!editing}
	done={m.condition_component_saved_toast()}
	class="max-h-[90svh] overflow-y-auto sm:max-w-lg"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={form.fields.name}
			label={m.condition_field_component_name()}
			placeholder={m.condition_component_name_placeholder()}
			value={editing?.name ?? ""}
		/>
		{#if hasArticles}
			<ArticleField
				field={form.fields.materialId}
				label={m.condition_field_article()}
				description={m.condition_component_article_description()}
				article={editing?.article ?? null}
				onchoose={chooseArticle}
			/>
		{/if}
		{#if hasCheckpoints}
			<Field.FieldSet>
				<Field.FieldLegend variant="label">{m.condition_field_checkpoints()}</Field.FieldLegend>
				{#if checkpoints.length}
					<Field.FieldDescription>
						{m.condition_component_checkpoints_description()}
					</Field.FieldDescription>
					{#each byTemplate as { template, groups } (template)}
						<div class="flex flex-col gap-2" data-checkpoint-template={template}>
							{#if byTemplate.length > 1}
								<span class="text-xs font-medium text-muted-foreground">{template}</span>
							{/if}
							{#each groups as { group, points } (group)}
								<div class="flex flex-col gap-1.5">
									{#if group}
										<span class="text-xs font-medium text-muted-foreground">{group}</span>
									{/if}
									{#each points as point (point.id)}
										<label class="flex items-start gap-2 text-sm">
											<input
												class="mt-0.5 size-4 shrink-0 accent-primary"
												{...form.fields.checkpointIds.as(
													"checkbox",
													String(point.id),
													editing?.checkpointIds.includes(point.id) ?? false,
												)}
											/>
											<span>{point.text}</span>
										</label>
									{/each}
								</div>
							{/each}
						</div>
					{/each}
				{:else}
					<Field.FieldDescription>{m.condition_component_no_checkpoints()}</Field.FieldDescription>
				{/if}
				<Field.FieldError errors={form.fields.checkpointIds.issues()} />
			</Field.FieldSet>
		{/if}
	</Field.FieldGroup>
</FormDialog>
