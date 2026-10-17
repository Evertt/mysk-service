<!--
	@component
	A component on its unit's card: its name, number and article, its latest condition, status and
	advice, how many points check it; buttons to move it up or down, and a menu to edit it, record its
	condition or remove it.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { errorMessage } from "#lib/utils.ts";

	import { moveComponent, removeComponent } from "../components.remote.ts";
	import type { Concern, ScoreBand, UnitStatus } from "../model.ts";
	import ConditionBar from "../ui/condition-bar.svelte";
	import StatusBadge from "../ui/status-badge.svelte";

	let {
		part,
		first,
		last,
		onedit,
		onrecord,
	}: {
		part: {
			id: number;
			number: string;
			name: string;
			article: { sku: string; name: string } | null;
			score: number | null;
			band: string;
			advice: string | null;
			status: UnitStatus;
			concern: Concern;
			checkpointIds: number[];
		};
		/** Whether it's the unit's first component, so it can't move up. */
		first: boolean;
		/** Whether it's the last, so it can't move down. */
		last: boolean;
		onedit: () => void;
		onrecord: () => void;
	} = $props();

	let removing = $state(false);
	const remove = $derived(removeComponent.for(String(part.id)));
	const moves = $derived([
		{
			direction: "up" as const,
			form: moveComponent.for(`${part.id}-up`),
			label: m.condition_component_move_up(),
			icon: ArrowUpIcon,
			disabled: first,
		},
		{
			direction: "down" as const,
			form: moveComponent.for(`${part.id}-down`),
			label: m.condition_component_move_down(),
			icon: ArrowDownIcon,
			disabled: last,
		},
	]);
	const details = $derived(
		[
			part.number,
			part.article && m.condition_component_article({ sku: part.article.sku }),
			m.condition_component_points({ count: part.checkpointIds.length }),
		]
			.filter(Boolean)
			.join(" · "),
	);
</script>

<li class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-component={part.number}>
	<div class="flex items-start justify-between gap-2">
		<div class="flex min-w-0 flex-col">
			<span class="truncate font-medium">{part.name}</span>
			<span class="truncate text-xs text-muted-foreground">{details}</span>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#each moves as move (move.direction)}
				<form
					{...move.form.enhance(async ({ submit }) => {
						try {
							await submit();
						} catch (error) {
							toast.error(errorMessage(error, m.common_error_generic()));
						}
					})}
				>
					<input {...move.form.fields.id.as("hidden", String(part.id))} />
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
							aria-label={m.condition_component_actions({ name: part.name })}
						>
							<EllipsisIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-44">
					<DropdownMenu.Item onclick={onrecord}>
						<GaugeIcon />{m.condition_record()}
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={onedit}>
						<PencilIcon />{m.common_edit()}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onclick={() => (removing = true)}>
						<Trash2Icon />{m.condition_component_remove()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<ConditionBar
			score={part.score}
			band={part.band === "none" ? null : (part.band as ScoreBand)}
		/>
		<StatusBadge status={part.status} concern={part.concern} />
	</div>
	{#if part.advice}
		<p class="text-sm text-muted-foreground" data-advice>{part.advice}</p>
	{/if}

	<AlertDialog.Root bind:open={removing}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title
					>{m.condition_component_remove_title({ name: part.name })}</AlertDialog.Title
				>
				<AlertDialog.Description
					>{m.condition_component_remove_description()}</AlertDialog.Description
				>
			</AlertDialog.Header>
			<form
				{...remove.enhance(async ({ submit }) => {
					try {
						if (!(await submit())) return;
						removing = false;
						toast.success(m.condition_component_removed_toast());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...remove.fields.id.as("hidden", String(part.id))} />
				<Field.FieldError errors={remove.fields.allIssues()} class="mb-4" />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
					<Button type="submit" variant="destructive" disabled={!!remove.pending}>
						{m.condition_component_remove()}
					</Button>
				</AlertDialog.Footer>
			</form>
		</AlertDialog.Content>
	</AlertDialog.Root>
</li>
