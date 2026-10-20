<!--
	@component
	A point of a checklist template on its page: what's checked, and for managers buttons to move it
	up or down (past the edge of its group, into the next) and a menu to edit or delete it.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { removePoint, shiftPoint } from "../templates.remote.ts";

	let {
		point,
		number,
		first,
		last,
		canChange,
		onedit,
	}: {
		point: { id: number; group: string; text: string };
		/** Its number in the template, from 1. */
		number: number;
		/** Whether it's the template's first point, so it can't move up. */
		first: boolean;
		/** Whether it's the last, so it can't move down. */
		last: boolean;
		/** Whether the user may change it (a manager, and the template isn't retired). */
		canChange: boolean;
		onedit: () => void;
	} = $props();

	let deleting = $state(false);
	const remove = $derived(removePoint.for(String(point.id)));
	const moves = $derived([
		{
			direction: "up" as const,
			form: shiftPoint.for(`${point.id}-up`),
			label: m.checklists_point_move_up({ number }),
			icon: ArrowUpIcon,
			disabled: first,
		},
		{
			direction: "down" as const,
			form: shiftPoint.for(`${point.id}-down`),
			label: m.checklists_point_move_down({ number }),
			icon: ArrowDownIcon,
			disabled: last,
		},
	]);
</script>

<li class="flex items-start gap-3 py-2" data-point={point.id}>
	<span class="w-6 shrink-0 pt-0.5 text-right text-sm text-muted-foreground tabular-nums">
		{number}.
	</span>
	<span class="min-w-0 flex-1 pt-0.5 text-sm">{point.text}</span>
	{#if canChange}
		<div class="flex shrink-0 items-center gap-1">
			{#each moves as move (move.direction)}
				<form
					{...move.form.enhance(async ({ submit }) => {
						await submitted(submit);
					})}
				>
					<input {...move.form.fields.id.as("hidden", String(point.id))} />
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
							aria-label={m.checklists_point_actions({ number })}
						>
							<EllipsisIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-40">
					<DropdownMenu.Item onclick={onedit}>
						<PencilIcon />{m.common_edit()}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onclick={() => (deleting = true)}>
						<Trash2Icon />{m.common_delete()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>

		<ConfirmDialog
			form={remove}
			hidden={{ id: String(point.id) }}
			title={m.checklists_point_delete_title({ number })}
			description={point.text}
			confirmLabel={m.common_delete()}
			destructive
			done={m.checklists_point_deleted()}
			bind:open={deleting}
		/>
	{/if}
</li>
