<!--
	@component
	A unit's documents on its page in the office: the list by kind (`DocumentList`), each with a menu
	to rename it (`DocumentDialog`) or delete it (after asking), and a form that uploads one (a title,
	its kind and the file). The form is a plain multipart form, so it works without JavaScript too.
-->
<script lang="ts">
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import FileUpIcon from "@lucide/svelte/icons/file-up";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import FormField from "#lib/components/form/form-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatFileSize, labelOptions } from "#lib/i18n/index.ts";
	import { equipmentDocumentKinds } from "#lib/models.ts";

	import DocumentDialog from "./document-dialog.svelte";
	import DocumentList from "./document-list.svelte";
	import { addDocument, deleteDocument, getUnitDocuments } from "./documents.remote.ts";
	import { documentAccept, MAX_DOCUMENT_BYTES, type UnitDocument } from "./documents.ts";

	let { serial }: { serial: string } = $props();

	const data = $derived(await getUnitDocuments(serial));
	const form = $derived(addDocument.for(serial));
	const kinds = $derived(labelOptions("equipmentDocumentKind", equipmentDocumentKinds));

	/** The document the edit dialog or the delete question is about. */
	let chosen = $state<UnitDocument | null>(null);
	let editing = $state(false);
	let deleting = $state(false);

	// Live: a document added, renamed or deleted elsewhere (logged on the unit).
	refreshOnRecordChange(
		() => ({ type: "equipment", id: data.unitId }),
		() => getUnitDocuments(serial).refresh(),
	);
</script>

<Card.Root data-documents-card>
	<Card.Header>
		<Card.Title>{m.equipment_documents_title()}</Card.Title>
		<Card.Description>{m.equipment_documents_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if data.documents.length}
			<DocumentList documents={data.documents}>
				{#snippet actions(document)}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label={m.equipment_documents_edit({ title: document.title })}
									data-document-actions={document.id}
								>
									<EllipsisIcon />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="min-w-40">
							<DropdownMenu.Item
								onclick={() => {
									chosen = document;
									editing = true;
								}}
							>
								<PencilIcon />{m.common_edit()}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								variant="destructive"
								onclick={() => {
									chosen = document;
									deleting = true;
								}}
							>
								<Trash2Icon />{m.common_delete()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</DocumentList>
		{:else}
			<p class="text-sm text-muted-foreground">{m.equipment_documents_none()}</p>
		{/if}

		<form
			{...form.enhance(async ({ element, submit }) => {
				if (!(await submitted(submit))) return;
				element.reset();
				toast.success(m.equipment_documents_added());
			})}
			enctype="multipart/form-data"
			class="flex flex-col gap-4 border-t pt-4"
			aria-label={m.equipment_documents_add()}
			data-add-document
		>
			<h3 class="text-sm font-medium">{m.equipment_documents_add()}</h3>
			<input {...form.fields.unitId.as("hidden", String(data.unitId))} />
			<Field.FieldGroup>
				<TextField
					field={form.fields.title}
					label={m.equipment_documents_field_title()}
					placeholder={m.equipment_documents_field_title_placeholder()}
					autocomplete="off"
				/>
				<SelectField
					field={form.fields.kind}
					label={m.equipment_documents_field_kind()}
					options={kinds}
					value="manual"
				/>
				<FormField
					label={m.equipment_documents_field_file()}
					issues={form.fields.file.issues()}
					description={m.equipment_documents_field_file_description({
						size: formatFileSize(MAX_DOCUMENT_BYTES),
					})}
				>
					{#snippet children({ id })}
						<Input {id} accept={documentAccept} {...form.fields.file.as("file")} />
					{/snippet}
				</FormField>
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.issues()} />
			<div>
				<SubmitButton variant="outline" icon={FileUpIcon} pending={form.pending}>
					{m.equipment_documents_upload()}
				</SubmitButton>
			</div>
		</form>
	</Card.Content>
</Card.Root>

<DocumentDialog document={chosen} bind:open={editing} />

<ConfirmDialog
	bind:open={deleting}
	form={deleteDocument}
	hidden={{ id: chosen ? String(chosen.id) : undefined }}
	title={m.equipment_documents_delete_title({ title: chosen?.title ?? "" })}
	description={m.equipment_documents_delete_description()}
	confirmLabel={m.common_delete()}
	confirmIcon={Trash2Icon}
	destructive
	done={m.equipment_documents_deleted()}
/>
