<!--
	@component
	One of a site's locations on the customer's sites card: its name (linked to its page), how many
	units are there and what helps to find it, with a menu to rename and delete it (refused while
	units are there).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { errorMessage } from "#lib/utils.ts";

	import LocationDialog from "./location-dialog.svelte";
	import { deleteLocation } from "./locations.remote.ts";

	let {
		location,
	}: {
		location: {
			id: number;
			siteId: number;
			name: string;
			description: string | null;
			unitCount: number;
		};
	} = $props();

	let editing = $state(false);
	let deleting = $state(false);
	const remove = $derived(deleteLocation.for(String(location.id)));
</script>

<li class="flex items-start justify-between gap-2 py-2" data-location={location.id}>
	<div class="flex min-w-0 flex-col">
		<a
			href={resolve("/(app)/equipment/locations/[id]", { id: String(location.id) })}
			class="truncate text-sm font-medium underline-offset-4 hover:underline"
		>
			{location.name}
		</a>
		<span class="text-xs text-muted-foreground">
			{[m.common_count_units({ count: location.unitCount }), location.description]
				.filter(Boolean)
				.join(" · ")}
		</span>
	</div>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.equipment_location_actions({ name: location.name })}
				>
					<EllipsisIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			<DropdownMenu.Item onclick={() => (editing = true)}>
				<PencilIcon />{m.common_edit()}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onclick={() => (deleting = true)}>
				<Trash2Icon />{m.common_delete()}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<LocationDialog siteId={location.siteId} {location} bind:open={editing} />

	<AlertDialog.Root bind:open={deleting}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>
					{m.equipment_location_delete_title({ name: location.name })}
				</AlertDialog.Title>
				<AlertDialog.Description
					>{m.equipment_location_delete_description()}</AlertDialog.Description
				>
			</AlertDialog.Header>
			<form
				{...remove.enhance(async ({ submit }) => {
					try {
						if (!(await submit())) return;
						deleting = false;
						toast.success(m.equipment_location_deleted());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...remove.fields.id.as("hidden", String(location.id))} />
				<!-- E.g. while units are there. -->
				<Field.FieldError errors={remove.fields.allIssues()} class="mb-4" />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
					<Button type="submit" variant="destructive" disabled={!!remove.pending}>
						{m.common_delete()}
					</Button>
				</AlertDialog.Footer>
			</form>
		</AlertDialog.Content>
	</AlertDialog.Root>
</li>
