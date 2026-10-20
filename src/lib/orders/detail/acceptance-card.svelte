<!--
	@component
	An order a customer reported in the customer portal, on its page: who reported it and when, and
	while it awaits acceptance the planner's choice: accept it (as a quote, or planned at once with
	an engineer, a day and a time) or reject it with a reason, which the customer reads. Once
	decided, what was decided, by whom.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import XIcon from "@lucide/svelte/icons/x";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatDate, formatDateTime } from "#lib/i18n/index.ts";
	import { isAwaitingAcceptance, type OrderStatus } from "#lib/models.ts";

	import {
		acceptReportedOrder,
		getAcceptanceOptions,
		rejectReportedOrder,
	} from "./acceptance.remote.ts";

	let {
		order,
		request,
	}: {
		order: { id: number; number: string; status: OrderStatus; createdAt: Temporal.Instant };
		request: {
			reporterName: string;
			decidedAt: Temporal.Instant | null;
			decidedBy: string | null;
			rejectionReason: string | null;
		};
	} = $props();

	const awaiting = $derived(isAwaitingAcceptance(order.status));
	let accepting = $state(false);
	let rejecting = $state(false);

	// Whom it can be planned for when it's accepted.
	const options = $derived(awaiting ? await getAcceptanceOptions() : { engineers: [] });

	const accept = $derived(acceptReportedOrder.for(String(order.id)));
	const reject = $derived(rejectReportedOrder.for(String(order.id)));
</script>

<Card.Root data-acceptance class={awaiting ? "border-amber-500/50" : undefined}>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<InboxIcon class="size-4" />
			{awaiting ? m.orders_acceptance_awaiting() : m.orders_acceptance_reported()}
		</Card.Title>
		<Card.Description>
			{m.orders_acceptance_reported_by({
				name: request.reporterName,
				date: formatDateTime(order.createdAt),
			})}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if awaiting}
			<div class="flex flex-wrap gap-2">
				<Button onclick={() => (accepting = true)}>
					<CheckIcon data-icon="inline-start" />
					{m.orders_accept()}
				</Button>
				<Button variant="outline" onclick={() => (rejecting = true)}>
					<XIcon data-icon="inline-start" />
					{m.orders_reject()}
				</Button>
			</div>
		{:else if request.rejectionReason !== null}
			<p class="text-sm" data-decision="rejected">
				{m.orders_acceptance_rejected({
					name: request.decidedBy ?? "—",
					date: request.decidedAt ? formatDate(request.decidedAt) : "—",
				})}
			</p>
			<p class="mt-1 text-sm whitespace-pre-line text-muted-foreground">
				{request.rejectionReason}
			</p>
		{:else if request.decidedAt}
			<p class="text-sm" data-decision="accepted">
				{m.orders_acceptance_accepted({
					name: request.decidedBy ?? "—",
					date: formatDate(request.decidedAt),
				})}
			</p>
		{/if}
	</Card.Content>
</Card.Root>

{#if awaiting}
	<FormDialog
		form={accept}
		title={m.orders_accept_title({ number: order.number })}
		description={m.orders_accept_description()}
		submitLabel={m.orders_accept()}
		submitIcon={CheckIcon}
		hidden={{ id: String(order.id) }}
		done={m.orders_accepted({ number: order.number })}
		bind:open={accepting}
	>
		<div class="flex flex-col gap-4">
			<SelectField
				field={accept.fields.engineerId}
				label={m.orders_accept_engineer()}
				placeholder={m.orders_accept_no_engineer()}
				options={options.engineers.map((each) => ({
					value: String(each.id),
					label: each.name,
				}))}
			/>
			<div class="grid gap-4 sm:grid-cols-2">
				<TextField field={accept.fields.day} label={m.orders_accept_day()} type="date" />
				<TextField field={accept.fields.time} label={m.orders_accept_time()} type="time" />
			</div>
		</div>
	</FormDialog>

	<FormDialog
		form={reject}
		title={m.orders_reject_title({ number: order.number })}
		description={m.orders_reject_description()}
		submitLabel={m.orders_reject()}
		submitIcon={XIcon}
		destructive
		hidden={{ id: String(order.id) }}
		done={m.orders_rejected({ number: order.number })}
		bind:open={rejecting}
	>
		<TextField field={reject.fields.reason} label={m.orders_reject_reason()} multiline />
	</FormDialog>
{/if}
