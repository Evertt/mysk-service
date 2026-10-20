<!--
	@component
	Deletes one of a customer's docks, after asking: its live state, sessions and events go with it.
-->
<script lang="ts">
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";

	import { deleteCustomerDock } from "../docks.remote.ts";

	let { customer, dock }: { customer: string; dock: { id: number; code: string } } = $props();

	const form = $derived(deleteCustomerDock.for(String(dock.id)));
</script>

<ConfirmDialog
	{form}
	hidden={{ customer, id: String(dock.id) }}
	title={m.docks_delete_title({ code: dock.code })}
	description={m.docks_delete_description()}
	confirmLabel={m.docks_delete()}
	destructive
	done={m.docks_deleted({ code: dock.code })}
>
	{#snippet trigger(props)}
		<Button
			{...props}
			variant="ghost"
			size="icon-sm"
			aria-label={m.docks_delete_title({ code: dock.code })}
		>
			<Trash2Icon />
		</Button>
	{/snippet}
</ConfirmDialog>
