<!--
	@component
	Deletes a zone, consumer or door of a site, after asking: an icon button in its row. If the
	server refuses (it holds measurements), the reason is shown in the dialog.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { submitted } from "#lib/components/form/submitted.ts";

	let {
		form: remote,
		siteId,
		id,
		title,
		description,
		deleted,
	}: {
		form: RemoteForm<{ energySiteId: string; id: string }, unknown>;
		siteId: number;
		id: number;
		/** The question, e.g. "Delete zone Z-A?"; also the button's label. */
		title: string;
		description: string;
		/** The toast once it's gone. */
		deleted: string;
	} = $props();

	let open = $state(false);
	const form = $derived(remote.for(String(id)));
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label={title}>
				<Trash2Icon />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submitted(submit)) {
					open = false;
					toast.success(deleted);
				}
			})}
		>
			<input {...form.fields.energySiteId.as("hidden", String(siteId))} />
			<input {...form.fields.id.as("hidden", String(id))} />
			<Field.FieldError errors={form.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={!!form.pending}>
					{#if form.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
