<!--
	@component
	What a customer can be billed for (from `getBillable`), as checkboxes for a form's `orderIds`
	and `items`, all checked to start with unless `checked` is false: their completed orders that
	aren't invoiced yet, with the lines each becomes, and other modules' items such as contract fees.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";
	import CheckIcon from "@lucide/svelte/icons/check";

	import { formatCents, formatDate } from "#lib/format.js";
	import OrderLink from "#lib/orders/order-link.svelte";

	import type { getBillable } from "./invoices.remote.js";

	type Billable = Awaited<ReturnType<typeof getBillable>>;

	let {
		billable,
		orderIds,
		items,
		checked = true,
	}: {
		billable: Billable;
		orderIds: RemoteFormField<string[]>;
		items: RemoteFormField<string[]>;
		/** Whether everything starts checked. */
		checked?: boolean;
	} = $props();

	const uid = $props.id();
	const issues = $derived([...(orderIds.issues() ?? []), ...(items.issues() ?? [])]);
</script>

{#snippet checkbox(id: string, attributes: ReturnType<RemoteFormField<string[]>["as"]>)}
	<span class="relative mt-0.5 flex size-4 shrink-0">
		<input
			{id}
			class="peer size-4 shrink-0 appearance-none rounded-[4px] border border-input shadow-xs transition-shadow outline-none checked:border-primary checked:bg-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:checked:bg-primary"
			{...attributes}
		/>
		<CheckIcon
			class="pointer-events-none invisible absolute inset-0 m-auto size-3.5 text-primary-foreground peer-checked:visible"
		/>
	</span>
{/snippet}

<Field.FieldSet data-invalid={issues.length ? true : undefined}>
	<Field.FieldLegend class="sr-only">{m.invoices_what_to_bill()}</Field.FieldLegend>
	{#if billable.orders.length || billable.items.length}
		<Field.FieldGroup class="gap-0 divide-y rounded-lg border">
			{#each billable.orders as order (order.id)}
				{@const id = `${uid}-order-${order.id}`}
				<Field.Field orientation="horizontal" class="items-start px-4 py-3">
					{@render checkbox(id, orderIds.as("checkbox", String(order.id), checked))}
					<Field.FieldContent>
						<Field.FieldLabel for={id} class="flex-wrap gap-x-2">
							<OrderLink number={order.number} />
							<span class="font-normal">{order.description}</span>
						</Field.FieldLabel>
						<Field.FieldDescription>
							{#if order.completedAt}{m.invoices_completed_on({
									date: formatDate(order.completedAt),
								})}{/if}
							{#each order.lines.slice(1) as line, i (i)}
								· {line.description}: {formatCents(line.amount)}
							{/each}
						</Field.FieldDescription>
					</Field.FieldContent>
					<span class="text-sm whitespace-nowrap tabular-nums">{formatCents(order.total)}</span>
				</Field.Field>
			{/each}
			{#each billable.items as item (item.reference)}
				{@const id = `${uid}-item-${item.reference}`}
				<Field.Field orientation="horizontal" class="items-start px-4 py-3">
					{@render checkbox(id, items.as("checkbox", item.reference, checked))}
					<Field.FieldContent>
						<Field.FieldLabel for={id}>{item.description}</Field.FieldLabel>
						{#if item.detail}
							<Field.FieldDescription>{item.detail}</Field.FieldDescription>
						{/if}
					</Field.FieldContent>
					<span class="text-sm whitespace-nowrap tabular-nums">{formatCents(item.amount)}</span>
				</Field.Field>
			{/each}
		</Field.FieldGroup>
	{:else}
		<p class="text-sm text-muted-foreground">
			{m.invoices_nothing_to_bill()}
		</p>
	{/if}
	<Field.FieldError errors={issues} />
</Field.FieldSet>
