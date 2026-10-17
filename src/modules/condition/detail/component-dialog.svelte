<!--
	@component
	Adds a component to a unit, or changes one: its name, its article (one of the tenant's materials,
	with the materials module on, by SKU) and the points of the unit's checklist that check it,
	grouped. Choosing an article checks the points its shop product fixes.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import type { Article, Checkpoint } from "../api/extensions.ts";
	import { saveComponent } from "../components.remote.ts";

	interface Editing {
		id: number;
		number: string;
		name: string;
		materialId: number | null;
		checkpointIds: number[];
	}

	let {
		open = $bindable(false),
		unit,
		editing,
		articles,
		articleCheckpoints,
		checkpoints,
		hasArticles,
	}: {
		open?: boolean;
		unit: { serialNumber: string; title: string };
		/** The component being changed; none for a new one. */
		editing: Editing | null;
		articles: Article[];
		/** The points each article's shop product fixes, by its id. */
		articleCheckpoints: Record<number, number[]>;
		checkpoints: Checkpoint[];
		/** Whether the tenant has materials, whose articles a component can have. */
		hasArticles: boolean;
	} = $props();

	const form = $derived(saveComponent.for(editing ? `component-${editing.id}` : "component-new"));
	const articleOptions = $derived(
		articles.map((article) => ({
			value: String(article.id),
			label: `${article.sku} · ${article.name}`,
		})),
	);
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
	function chooseArticle(value: string) {
		const points = articleCheckpoints[Number(value)]?.filter((id) => offered.has(id));
		if (points?.length) form.fields.checkpointIds.set(points.map(String));
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-component-dialog>
		<Dialog.Header>
			<Dialog.Title>
				{editing
					? m.condition_component_edit_title({ number: editing.number })
					: m.condition_component_add_title({ unit: unit.title })}
			</Dialog.Title>
			<Dialog.Description>{m.condition_component_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ element, submit }) => {
				if (!(await submit())) return;
				if (!editing) element.reset();
				open = false;
				toast.success(m.condition_component_saved_toast());
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.serialNumber.as("hidden", unit.serialNumber)} />
			<input {...form.fields.id.as("hidden", editing ? String(editing.id) : "")} />
			<Field.FieldGroup>
				<TextField
					field={form.fields.name}
					label={m.condition_field_component_name()}
					placeholder={m.condition_component_name_placeholder()}
					value={editing?.name ?? ""}
				/>
				{#if hasArticles}
					<SelectField
						field={form.fields.materialId}
						label={m.condition_field_article()}
						description={m.condition_component_article_description()}
						options={articleOptions}
						placeholder={m.condition_component_article_none()}
						value={editing?.materialId ? String(editing.materialId) : ""}
						onchange={chooseArticle}
					/>
				{/if}
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
						<Field.FieldDescription>{m.condition_component_no_checkpoints()}</Field.FieldDescription
						>
					{/if}
				</Field.FieldSet>
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.allIssues()} />
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
