<!--
	@component
	One of the tenant's equipment categories on the settings page: its name, specialty and how much
	equipment has it, with buttons to move it up or down the order and a menu to edit or delete it.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { submitted } from "#lib/components/form/submitted.ts";
	import { label } from "#lib/i18n/index.ts";
	import type { EngineerSpecialty } from "#lib/models.ts";

	import { deleteEquipmentCategory, moveEquipmentCategory } from "./categories.remote.ts";
	import CategoryDialog from "./category-dialog.svelte";

	let {
		category,
		first,
		last,
	}: {
		category: { id: number; name: string; specialty: EngineerSpecialty | null; unitCount: number };
		/** Whether it's first in the order, so it can't move up. */
		first: boolean;
		/** Whether it's last, so it can't move down. */
		last: boolean;
	} = $props();

	let editing = $state(false);
	let deleting = $state(false);
	const units = $derived(m.common_count_units({ count: category.unitCount }));
	const remove = $derived(deleteEquipmentCategory.for(String(category.id)));
	const moves = $derived([
		{
			direction: "up" as const,
			form: moveEquipmentCategory.for(`${category.id}-up`),
			label: m.equipment_category_move_up({ name: category.name }),
			icon: ArrowUpIcon,
			disabled: first,
		},
		{
			direction: "down" as const,
			form: moveEquipmentCategory.for(`${category.id}-down`),
			label: m.equipment_category_move_down({ name: category.name }),
			icon: ArrowDownIcon,
			disabled: last,
		},
	]);
</script>

<Table.Row data-category={category.name}>
	<Table.Cell class="font-medium">{category.name}</Table.Cell>
	<Table.Cell>
		{category.specialty ? label("engineerSpecialty", category.specialty) : "—"}
	</Table.Cell>
	<Table.Cell class="tabular-nums">{units}</Table.Cell>
	<Table.Cell>
		<div class="flex items-center justify-end gap-1">
			{#each moves as move (move.direction)}
				<form
					{...move.form.enhance(async ({ submit }) => {
						await submitted(submit);
					})}
				>
					<input {...move.form.fields.id.as("hidden", String(category.id))} />
					<input {...move.form.fields.direction.as("hidden", move.direction)} />
					<Button
						type="submit"
						variant="ghost"
						size="icon-sm"
						aria-label={move.label}
						title={move.label}
						disabled={move.disabled || !!move.form.pending}
					>
						<move.icon />
					</Button>
				</form>
			{/each}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={m.equipment_category_actions({ name: category.name })}
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
		</div>

		<CategoryDialog {category} bind:open={editing} />

		<AlertDialog.Root bind:open={deleting}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>
						{m.equipment_category_delete_title({ name: category.name })}
					</AlertDialog.Title>
					<AlertDialog.Description>
						{m.equipment_category_delete_description()}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<form
					{...remove.enhance(async ({ submit }) => {
						if (!(await submitted(submit))) return;
						deleting = false;
						toast.success(m.equipment_category_deleted());
					})}
				>
					<input {...remove.fields.id.as("hidden", String(category.id))} />
					<!-- E.g. while equipment has it. -->
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
	</Table.Cell>
</Table.Row>
