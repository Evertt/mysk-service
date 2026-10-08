<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import MailIcon from "@lucide/svelte/icons/mail";
	import PhoneIcon from "@lucide/svelte/icons/phone";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatQuantity } from "#lib/components/materials/display.js";
	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import { formatDateTime, formatTime } from "#lib/format.js";

	import { addNote, getMyOrder, logHours, startWork } from "../portal.remote.js";
	import { dayLabel, fieldActions } from "../work.js";
	import type { PageProps } from "./$types";
	import CompleteForm from "./complete-form.svelte";
	import MaterialsForm from "./materials-form.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getMyOrder(params.number));
	const order = $derived(data.order);
	const { customer, equipment } = $derived(data.order);
	const actions = $derived(fieldActions(order.status));
</script>

<svelte:head>
	<title>{m.portal_order_page_title({ number: order.number })}</title>
</svelte:head>

<div class="flex flex-col gap-3">
	<Button href={resolve("/(field)/my")} variant="ghost" size="sm" class="-ml-2 self-start">
		<ArrowLeftIcon data-icon="inline-start" />
		{m.portal_title()}
	</Button>
	<div class="flex flex-col gap-1">
		<span class="text-sm text-muted-foreground tabular-nums">{order.number}</span>
		<h1 class="text-2xl font-semibold tracking-tight">{customer.name}</h1>
		<p class="text-muted-foreground">
			{#if order.scheduledFor}
				{dayLabel(order.scheduledFor)}, {formatTime(order.scheduledFor)}
			{:else}
				{m.portal_no_time()}
			{/if}
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<StatusBadge status={order.status} />
		<PriorityBadge priority={order.priority} />
		<TypeLabel type={order.type} />
	</div>
</div>

{#if actions.start}
	<form
		{...startWork.enhance(async ({ submit }) => {
			if (await submit()) toast.success(m.portal_job_started());
		})}
	>
		<input {...startWork.fields.id.as("hidden", String(order.id))} />
		<Button type="submit" size="lg" class="h-12 w-full text-base" disabled={!!startWork.pending}>
			{#if startWork.pending}
				<Spinner data-icon="inline-start" />
			{:else}
				<PlayIcon data-icon="inline-start" />
			{/if}
			{m.portal_start_job()}
		</Button>
		<Field.FieldError errors={startWork.fields.allIssues()} class="mt-2" />
	</form>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_job()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<p class="whitespace-pre-line">{order.description}</p>
		<dl class="grid grid-cols-2 gap-4">
			{#if equipment}
				<DetailItem
					label={m.portal_equipment()}
					value={`${equipment.manufacturer} ${equipment.model}`}
				/>
				<DetailItem label={m.portal_serial_number()} value={equipment.serialNumber} />
			{:else}
				<DetailItem label={m.portal_equipment()} value={m.portal_new_installation()} />
			{/if}
		</dl>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_customer()}</Card.Title>
		<Card.Description>{customer.city}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<dl class="grid grid-cols-2 gap-4">
			<DetailItem label={m.portal_contact()} value={customer.contactName} />
			<DetailItem label={m.portal_city()} value={customer.city} />
		</dl>
		<div class="grid grid-cols-2 gap-2">
			<Button href={`tel:${customer.phone}`} variant="outline" size="lg" class="h-12">
				<PhoneIcon data-icon="inline-start" />
				{m.portal_call()}
			</Button>
			<Button href={`mailto:${customer.email}`} variant="outline" size="lg" class="h-12">
				<MailIcon data-icon="inline-start" />
				{m.portal_email()}
			</Button>
		</div>
		<p class="text-sm text-muted-foreground tabular-nums">{customer.phone}</p>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_labour()}</Card.Title>
		<Card.Description>{m.portal_labour_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if actions.work}
			<form
				{...logHours.enhance(async ({ submit }) => {
					if (await submit()) toast.success(m.portal_hours_saved());
				})}
				class="flex items-end gap-2"
			>
				<input {...logHours.fields.id.as("hidden", String(order.id))} />
				<NumberField
					field={logHours.fields.laborHours}
					label={m.portal_hours()}
					value={order.laborHours}
					min={0}
					step={0.25}
					class="flex-1"
				/>
				<Button type="submit" size="lg" class="h-12" disabled={!!logHours.pending}>
					{#if logHours.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.portal_save_hours()}
				</Button>
			</form>
		{:else}
			<p class="text-lg tabular-nums">{m.common_count_hours_short({ count: order.laborHours })}</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_materials()}</Card.Title>
		<Card.Description>
			{actions.work ? m.portal_materials_work() : m.portal_materials_done()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if actions.work}
			<MaterialsForm orderId={order.id} lines={order.lines} />
		{:else if order.lines.length}
			<ul class="flex flex-col divide-y">
				{#each order.lines as line (line.id)}
					<li class="flex justify-between gap-4 py-2">
						<span>{line.material.name}</span>
						<span class="text-muted-foreground tabular-nums">
							{formatQuantity(line.quantity, line.material.unit)}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.portal_no_materials()}</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_notes()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#each data.notes as note (note.id)}
			<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
				<p class="text-sm whitespace-pre-line">{note.text}</p>
				<span class="text-xs text-muted-foreground">
					{note.author ?? m.portal_someone()} · {formatDateTime(note.createdAt)}
				</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.portal_no_notes()}</p>
		{/each}
		{#if actions.note}
			<form
				{...addNote.enhance(async ({ element, submit }) => {
					if (await submit()) {
						element.reset();
						toast.success(m.portal_note_added());
					}
				})}
				class="flex flex-col gap-2"
			>
				<input {...addNote.fields.id.as("hidden", String(order.id))} />
				<TextField
					field={addNote.fields.text}
					label={m.portal_note_label()}
					multiline
					placeholder={m.portal_note_placeholder()}
				/>
				<Button type="submit" variant="outline" size="lg" class="h-12" disabled={!!addNote.pending}>
					{#if addNote.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.portal_add_note()}
				</Button>
			</form>
		{/if}
	</Card.Content>
</Card.Root>

{#if actions.work}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.portal_complete_title()}</Card.Title>
			<Card.Description>{m.portal_complete_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<CompleteForm orderId={order.id} contactName={customer.contactName} />
		</Card.Content>
	</Card.Root>
{:else if data.signoff}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.portal_signed_off()}</Card.Title>
			<Card.Description>
				{m.portal_signed_off_by({
					name: data.signoff.signerName,
					date: formatDateTime(data.signoff.signedAt),
				})}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<img
				src={data.signoff.signature}
				alt={m.portal_signature_of({ name: data.signoff.signerName })}
				class="h-32 w-full rounded-lg border bg-white object-contain"
			/>
		</Card.Content>
	</Card.Root>
{/if}
