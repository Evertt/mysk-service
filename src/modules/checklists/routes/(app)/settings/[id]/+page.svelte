<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ArchiveIcon from "@lucide/svelte/icons/archive";
	import ArchiveRestoreIcon from "@lucide/svelte/icons/archive-restore";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import RecordPage from "#lib/components/record-page.svelte";
	import CategoriesCard from "#modules/checklists/detail/categories-card.svelte";
	import PointsCard from "#modules/checklists/detail/points-card.svelte";
	import TemplateDialog from "#modules/checklists/form/template-dialog.svelte";
	import { getTemplate, restore, retire } from "#modules/checklists/templates.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/checklists/settings/[id]"> } = $props();

	const data = $derived(await getTemplate(params.id));
	const template = $derived(data.template);
	/** Managers change an active template; a retired one is restored first. */
	const canChange = $derived(data.canManage && !template.archived);

	let editing = $state(false);
	let retiring = $state(false);
	const retireForm = $derived(retire.for(String(template.id)));
	const restoreForm = $derived(restore.for(String(template.id)));
</script>

<RecordPage
	title={template.name}
	subtitle={template.norm ?? m.checklists_no_norm()}
	list={[
		{ label: m.checklists_module_name(), href: resolve("/(app)/(modules)/checklists") },
		{
			label: m.checklists_templates_title(),
			href: resolve("/(app)/(modules)/checklists/settings"),
		},
	]}
	subject={{ type: "checklistTemplate", id: template.id }}
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
					if (await submitted(submit)) toast.success(m.checklists_restored());
				})}
			>
				<input {...restoreForm.fields.id.as("hidden", String(template.id))} />
				<SubmitButton variant="outline" icon={ArchiveRestoreIcon} pending={restoreForm.pending}>
					{m.checklists_restore()}
				</SubmitButton>
			</form>
		{/if}
	{/snippet}
	{#snippet main()}
		<PointsCard templateId={template.id} points={data.points} {canChange} />
	{/snippet}
	{#snippet side()}
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
	{/snippet}
</RecordPage>

{#if canChange}
	<TemplateDialog {template} bind:open={editing} />

	<ConfirmDialog
		form={retireForm}
		hidden={{ id: String(template.id) }}
		title={m.checklists_retire_title({ name: template.name })}
		description={m.checklists_retire_description()}
		confirmLabel={m.checklists_retire()}
		done={m.checklists_retired_toast()}
		bind:open={retiring}
	/>
{/if}
