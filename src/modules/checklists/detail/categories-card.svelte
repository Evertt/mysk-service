<!--
	@component
	The equipment categories a checklist template is for, on its page: a unit of one is inspected by
	it. Managers tick them; a category another template is for says which, and can't be ticked here
	(a category has one template). Others see the template's categories.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { saveTemplateCategories } from "../templates.remote.ts";

	let {
		templateId,
		categories,
		canChange,
	}: {
		templateId: number;
		/** The tenant's categories, in their order, with the template each is for. */
		categories: {
			id: number;
			name: string;
			templateId: number | null;
			templateName: string | null;
		}[];
		/** Whether the user may change them (a manager, and the template isn't retired). */
		canChange: boolean;
	} = $props();

	const uid = $props.id();
	const form = $derived(saveTemplateCategories.for(String(templateId)));
	const own = $derived(categories.filter((category) => category.templateId === templateId));
</script>

<Card.Root data-checklist-categories>
	<Card.Header>
		<Card.Title>{m.checklists_categories_title()}</Card.Title>
		<Card.Description>{m.checklists_categories_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if canChange}
			<form
				{...form.enhance(async ({ submit }) => {
					if (await submitted(submit)) toast.success(m.checklists_categories_saved());
				})}
				class="flex flex-col gap-4"
			>
				<input {...form.fields.id.as("hidden", String(templateId))} />
				<Field.FieldSet data-invalid={form.fields.categoryIds.issues()?.length ? true : undefined}>
					<Field.FieldLegend class="sr-only">{m.checklists_categories_title()}</Field.FieldLegend>
					{#if categories.length}
						<Field.FieldGroup class="gap-0 divide-y rounded-lg border">
							{#each categories as category (category.id)}
								{@const id = `${uid}-category-${category.id}`}
								{@const elsewhere =
									category.templateId !== null && category.templateId !== templateId}
								<Field.Field
									orientation="horizontal"
									class="items-center px-3 py-2"
									data-category={category.name}
								>
									<span class="relative flex size-4 shrink-0">
										<input
											{id}
											disabled={elsewhere}
											class="peer size-4 shrink-0 appearance-none rounded-[4px] border border-input shadow-xs transition-shadow outline-none checked:border-primary checked:bg-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 dark:checked:bg-primary"
											{...form.fields.categoryIds.as(
												"checkbox",
												String(category.id),
												category.templateId === templateId,
											)}
										/>
										<CheckIcon
											class="pointer-events-none invisible absolute inset-0 m-auto size-3.5 text-primary-foreground peer-checked:visible"
										/>
									</span>
									<Field.FieldContent>
										<Field.FieldLabel for={id}>{category.name}</Field.FieldLabel>
										{#if elsewhere}
											<Field.FieldDescription>
												{m.checklists_category_has_template()}
												<a
													class="underline underline-offset-4"
													href={resolve("/(app)/(modules)/checklists/templates/[id]", {
														id: String(category.templateId),
													})}>{category.templateName}</a
												>
											</Field.FieldDescription>
										{/if}
									</Field.FieldContent>
								</Field.Field>
							{/each}
						</Field.FieldGroup>
					{:else}
						<p class="text-sm text-muted-foreground">{m.checklists_no_categories()}</p>
					{/if}
					<Field.FieldError errors={form.fields.allIssues()} />
				</Field.FieldSet>
				{#if categories.length}
					<div>
						<SubmitButton size="sm" pending={form.pending}>
							{m.checklists_save_categories()}
						</SubmitButton>
					</div>
				{/if}
			</form>
		{:else if own.length}
			<div class="flex flex-wrap gap-2">
				{#each own as category (category.id)}
					<Badge variant="outline">{category.name}</Badge>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.checklists_template_no_categories()}</p>
		{/if}
	</Card.Content>
</Card.Root>
