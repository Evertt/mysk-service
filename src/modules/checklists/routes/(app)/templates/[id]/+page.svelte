<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ArchiveIcon from "@lucide/svelte/icons/archive";
	import ArchiveRestoreIcon from "@lucide/svelte/icons/archive-restore";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import { toast } from "svelte-sonner";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { errorMessage } from "#lib/utils.ts";
	import CategoriesCard from "#modules/checklists/detail/categories-card.svelte";
	import PointsCard from "#modules/checklists/detail/points-card.svelte";
	import TemplateDialog from "#modules/checklists/form/template-dialog.svelte";
	import { getTemplate, restore, retire } from "#modules/checklists/templates.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/checklists/templates/[id]"> } = $props();

	const data = $derived(await getTemplate(params.id));
	const template = $derived(data.template);
	/** Managers change an active template; a retired one is restored first. */
	const canChange = $derived(data.canManage && !template.archived);

	let editing = $state(false);
	let retiring = $state(false);
	const retireForm = $derived(retire.for(String(template.id)));
	const restoreForm = $derived(restore.for(String(template.id)));
</script>

<svelte:head>
	<title>{template.name} · {m.checklists_templates_title()}</title>
</svelte:head>

<PageHeader
	title={template.name}
	description={template.norm ?? m.checklists_no_norm()}
	breadcrumbs={[
		{ label: m.checklists_module_name(), href: resolve("/(app)/(modules)/checklists") },
		{
			label: m.checklists_templates_title(),
			href: resolve("/(app)/(modules)/checklists/templates"),
		},
		{ label: template.name },
	]}
>
	{#snippet badges()}
		{#if template.archived}
			<Badge variant="secondary">{m.checklists_retired()}</Badge>
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if canChange}
			<Button variant="outline" onclick={() => (editing = true)}>
				<PencilIcon data-icon="inline-start" />
				{m.common_edit()}
			</Button>
			<Button variant="outline" onclick={() => (retiring = true)}>
				<ArchiveIcon data-icon="inline-start" />
				{m.checklists_retire()}
			</Button>
		{:else if data.canManage}
			<form
				{...restoreForm.enhance(async ({ submit }) => {
					try {
						if (await submit()) toast.success(m.checklists_restored());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...restoreForm.fields.id.as("hidden", String(template.id))} />
				<SubmitButton variant="outline" icon={ArchiveRestoreIcon} pending={restoreForm.pending}>
					{m.checklists_restore()}
				</SubmitButton>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<PointsCard templateId={template.id} points={data.points} {canChange} />
	</div>
	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root data-checklist-details>
			<Card.Content>
				<dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<DetailItem label={m.checklists_field_norm()} value={template.norm} />
					<DetailItem
						label={m.checklists_field_validity()}
						value={m.checklists_months({ count: template.validityMonths })}
					/>
				</dl>
			</Card.Content>
		</Card.Root>
		<CategoriesCard templateId={template.id} categories={data.categories} {canChange} />
		<ActivityCard type="checklistTemplate" id={template.id} />
	</div>
</div>

{#if canChange}
	<TemplateDialog {template} bind:open={editing} />

	<AlertDialog.Root bind:open={retiring}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.checklists_retire_title({ name: template.name })}</AlertDialog.Title>
				<AlertDialog.Description>{m.checklists_retire_description()}</AlertDialog.Description>
			</AlertDialog.Header>
			<form
				{...retireForm.enhance(async ({ submit }) => {
					try {
						if (!(await submit())) return;
						retiring = false;
						toast.success(m.checklists_retired_toast());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...retireForm.fields.id.as("hidden", String(template.id))} />
				<Field.FieldError errors={retireForm.fields.allIssues()} class="mb-4" />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
					<SubmitButton pending={retireForm.pending}>{m.checklists_retire()}</SubmitButton>
				</AlertDialog.Footer>
			</form>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}
