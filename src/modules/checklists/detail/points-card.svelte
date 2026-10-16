<!--
	@component
	The points of a checklist template on its page, numbered, under their groups' headings: for
	managers to add, edit, move and delete them, and to move a group past the one next to it.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import { errorMessage } from "#lib/utils.ts";

	import PointDialog from "../form/point-dialog.svelte";
	import { groupPoints } from "../model.ts";
	import { createPoint, shiftGroup } from "../templates.remote.ts";
	import PointRow from "./point-row.svelte";

	type Point = { id: number; group: string; text: string; position: number };

	let {
		templateId,
		points,
		canChange,
	}: {
		templateId: number;
		/** In their order. */
		points: Point[];
		/** Whether the user may change them (a manager, and the template isn't retired). */
		canChange: boolean;
	} = $props();

	const groups = $derived(groupPoints(points));
	const numbers = $derived(new Map(points.map((point, i) => [point.id, i + 1])));

	let dialog = $state<{ open: boolean; point?: Point; group?: string }>({ open: false });
	function add(group?: string) {
		// Afresh, also after a dialog that was closed half filled in.
		createPoint.fields.set({ templateId: String(templateId), group: group ?? "", text: "" });
		dialog = { open: true, group };
	}
	const edit = (point: Point) => (dialog = { open: true, point });

	const groupMoves = (group: string, index: number) => [
		{
			direction: "up" as const,
			form: shiftGroup.for(`${group}-up`),
			label: m.checklists_group_move_up({ group: group || m.checklists_no_group() }),
			icon: ArrowUpIcon,
			disabled: index === 0,
		},
		{
			direction: "down" as const,
			form: shiftGroup.for(`${group}-down`),
			label: m.checklists_group_move_down({ group: group || m.checklists_no_group() }),
			icon: ArrowDownIcon,
			disabled: index === groups.length - 1,
		},
	];
</script>

<Card.Root data-checklist-points>
	<Card.Header>
		<Card.Title>{m.checklists_points_title()}</Card.Title>
		<Card.Description>{m.checklists_count_points({ count: points.length })}</Card.Description>
		{#if canChange}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={() => add()}>
					<PlusIcon data-icon="inline-start" />
					{m.checklists_add_point()}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#each groups as { group, points: items }, index (group)}
			<section class="flex flex-col gap-1" data-group={group}>
				<div class="flex items-center gap-2 border-b pb-1">
					<h3 class="flex-1 text-sm font-semibold">
						{#if group}{group}{:else}<span class="text-muted-foreground"
								>{m.checklists_no_group()}</span
							>{/if}
					</h3>
					{#if canChange}
						{#if groups.length > 1}
							{#each groupMoves(group, index) as move (move.direction)}
								<form
									{...move.form.enhance(async ({ submit }) => {
										try {
											await submit();
										} catch (error) {
											toast.error(errorMessage(error, m.common_error_generic()));
										}
									})}
								>
									<input {...move.form.fields.templateId.as("hidden", String(templateId))} />
									<input {...move.form.fields.group.as("hidden", group)} />
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
						{/if}
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m.checklists_add_point_to({ group: group || m.checklists_no_group() })}
							title={m.checklists_add_point_to({ group: group || m.checklists_no_group() })}
							onclick={() => add(group)}
						>
							<PlusIcon />
						</Button>
					{/if}
				</div>
				<ul class="flex flex-col">
					{#each items as point (point.id)}
						<PointRow
							{point}
							number={numbers.get(point.id)!}
							first={point.id === points[0].id}
							last={point.id === points.at(-1)!.id}
							{canChange}
							onedit={() => edit(point)}
						/>
					{/each}
				</ul>
			</section>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.checklists_points_empty_title()}</Empty.Title>
					<Empty.Description>{m.checklists_points_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</Card.Content>
</Card.Root>

{#if canChange}
	<!-- Keyed by the point, so the form starts from the one being edited. -->
	{#key dialog.point?.id}
		<PointDialog
			{templateId}
			groups={groups.map((g) => g.group)}
			point={dialog.point}
			group={dialog.group}
			bind:open={dialog.open}
		/>
	{/key}
{/if}
