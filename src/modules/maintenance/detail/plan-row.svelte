<!--
	@component
	One of a unit's maintenance plans on its card: what it is, how often, when it's next due and its
	last order, with a menu to edit, pause or resume, and delete it.
-->
<script lang="ts">
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlayIcon from "@lucide/svelte/icons/play";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { label } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";
	import { errorMessage } from "#lib/utils.ts";

	import PlanDialog from "../form/plan-dialog.svelte";
	import type { PlanOrderType } from "../model.ts";
	import { deletePlan, pausePlan } from "../plans.remote.ts";
	import NextDue from "../ui/next-due.svelte";

	let {
		plan,
		equipmentId,
	}: {
		plan: {
			id: number;
			orderType: PlanOrderType;
			description: string;
			intervalMonths: number;
			nextDueOn: Temporal.PlainDate;
			paused: boolean;
			lastOrder: string | null;
		};
		equipmentId: number;
	} = $props();

	let editing = $state(false);
	let deleting = $state(false);
	const remove = $derived(deletePlan.for(String(plan.id)));

	async function togglePause() {
		try {
			await pausePlan({ id: plan.id, paused: !plan.paused });
			toast.success(m.maintenance_plan_saved());
		} catch (error) {
			toast.error(errorMessage(error, m.common_error_generic()));
		}
	}
</script>

<li class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0" data-plan={plan.id}>
	<div class="flex min-w-0 flex-col gap-1">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-medium">{plan.description}</span>
			{#if plan.paused}
				<Badge variant="secondary">{m.maintenance_paused()}</Badge>
			{/if}
		</div>
		<span class="text-sm text-muted-foreground">
			{label("orderType", plan.orderType)} · {m.maintenance_every_months({
				count: plan.intervalMonths,
			})}
		</span>
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
			<dt class="text-muted-foreground">{m.maintenance_column_next_due()}</dt>
			<dd><NextDue value={plan.nextDueOn} badge={!plan.paused} /></dd>
			<dt class="text-muted-foreground">{m.maintenance_column_last_order()}</dt>
			<dd>
				{#if plan.lastOrder}
					<OrderLink number={plan.lastOrder} />
				{:else}
					<span class="text-muted-foreground">{m.maintenance_last_order_none()}</span>
				{/if}
			</dd>
		</dl>
	</div>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.maintenance_plan_actions({ plan: plan.description })}
				>
					<EllipsisIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			<DropdownMenu.Item onclick={() => (editing = true)}>
				<PencilIcon />{m.common_edit()}
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={togglePause}>
				{#if plan.paused}
					<PlayIcon />{m.maintenance_resume()}
				{:else}
					<PauseIcon />{m.maintenance_pause()}
				{/if}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onclick={() => (deleting = true)}>
				<Trash2Icon />{m.common_delete()}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<PlanDialog {equipmentId} {plan} bind:open={editing} />

	<AlertDialog.Root bind:open={deleting}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title
					>{m.maintenance_delete_title({ plan: plan.description })}</AlertDialog.Title
				>
				<AlertDialog.Description>{m.maintenance_delete_description()}</AlertDialog.Description>
			</AlertDialog.Header>
			<form
				{...remove.enhance(async ({ submit }) => {
					try {
						if (!(await submit())) return;
						deleting = false;
						toast.success(m.maintenance_plan_deleted());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...remove.fields.id.as("hidden", String(plan.id))} />
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
