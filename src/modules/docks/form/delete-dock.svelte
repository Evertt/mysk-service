<!--
	@component
	Deletes one of a customer's docks, after asking: its live state, sessions and events go with it.
-->
<script lang="ts">
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { deleteCustomerDock } from "../docks.remote.ts";

	let { customer, dock }: { customer: string; dock: { id: number; code: string } } = $props();

	let open = $state(false);
	const form = $derived(deleteCustomerDock.for(String(dock.id)));
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label={m.docks_delete_title({ code: dock.code })}
			>
				<Trash2Icon />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.docks_delete_title({ code: dock.code })}</AlertDialog.Title>
			<AlertDialog.Description>{m.docks_delete_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) {
					open = false;
					toast.success(m.docks_deleted({ code: dock.code }));
				}
			})}
		>
			<input {...form.fields.customer.as("hidden", customer)} />
			<input {...form.fields.id.as("hidden", String(dock.id))} />
			<Field.FieldError errors={form.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={!!form.pending}>
					{#if form.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.docks_delete()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
