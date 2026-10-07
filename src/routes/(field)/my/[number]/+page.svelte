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
	import { formatDate } from "#lib/format.js";
	import { formatTime } from "#lib/format.js";

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
	<title>{order.number} · My work</title>
</svelte:head>

<div class="flex flex-col gap-3">
	<Button href={resolve("/(field)/my")} variant="ghost" size="sm" class="-ml-2 self-start">
		<ArrowLeftIcon data-icon="inline-start" />
		My work
	</Button>
	<div class="flex flex-col gap-1">
		<span class="text-sm text-muted-foreground tabular-nums">{order.number}</span>
		<h1 class="text-2xl font-semibold tracking-tight">{customer.name}</h1>
		<p class="text-muted-foreground">
			{#if order.scheduledFor}
				{dayLabel(order.scheduledFor)}, {formatTime(order.scheduledFor)}
			{:else}
				No time set
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
			if (await submit()) toast.success("Job started");
		})}
	>
		<input {...startWork.fields.id.as("hidden", String(order.id))} />
		<Button type="submit" size="lg" class="h-12 w-full text-base" disabled={!!startWork.pending}>
			{#if startWork.pending}
				<Spinner data-icon="inline-start" />
			{:else}
				<PlayIcon data-icon="inline-start" />
			{/if}
			Start job
		</Button>
		<Field.FieldError errors={startWork.fields.allIssues()} class="mt-2" />
	</form>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>The job</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<p class="whitespace-pre-line">{order.description}</p>
		<dl class="grid grid-cols-2 gap-4">
			{#if equipment}
				<DetailItem label="Equipment" value={`${equipment.manufacturer} ${equipment.model}`} />
				<DetailItem label="Serial number" value={equipment.serialNumber} />
			{:else}
				<DetailItem label="Equipment" value="New installation" />
			{/if}
		</dl>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Customer</Card.Title>
		<Card.Description>{customer.city}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<dl class="grid grid-cols-2 gap-4">
			<DetailItem label="Contact" value={customer.contactName} />
			<DetailItem label="City" value={customer.city} />
		</dl>
		<div class="grid grid-cols-2 gap-2">
			<Button href={`tel:${customer.phone}`} variant="outline" size="lg" class="h-12">
				<PhoneIcon data-icon="inline-start" />
				Call
			</Button>
			<Button href={`mailto:${customer.email}`} variant="outline" size="lg" class="h-12">
				<MailIcon data-icon="inline-start" />
				Email
			</Button>
		</div>
		<p class="text-sm text-muted-foreground tabular-nums">{customer.phone}</p>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Labour</Card.Title>
		<Card.Description>Hours worked on this job so far.</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if actions.work}
			<form
				{...logHours.enhance(async ({ submit }) => {
					if (await submit()) toast.success("Hours saved");
				})}
				class="flex items-end gap-2"
			>
				<input {...logHours.fields.id.as("hidden", String(order.id))} />
				<NumberField
					field={logHours.fields.laborHours}
					label="Hours"
					value={order.laborHours}
					min={0}
					step={0.25}
					class="flex-1"
				/>
				<Button type="submit" size="lg" class="h-12" disabled={!!logHours.pending}>
					{#if logHours.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Save hours
				</Button>
			</form>
		{:else}
			<p class="text-lg tabular-nums">{order.laborHours} h</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Materials</Card.Title>
		<Card.Description>
			{actions.work ? "What you used; it comes out of stock." : "Used on this job."}
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
			<p class="text-sm text-muted-foreground">No materials used.</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Notes</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#each data.notes as note (note.id)}
			<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
				<p class="text-sm whitespace-pre-line">{note.text}</p>
				<span class="text-xs text-muted-foreground">
					{note.author ?? "Someone"} · {formatDate(note.createdAt)}
					{formatTime(note.createdAt)}
				</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No notes yet.</p>
		{/each}
		{#if actions.note}
			<form
				{...addNote.enhance(async ({ element, submit }) => {
					if (await submit()) {
						element.reset();
						toast.success("Note added");
					}
				})}
				class="flex flex-col gap-2"
			>
				<input {...addNote.fields.id.as("hidden", String(order.id))} />
				<TextField
					field={addNote.fields.text}
					label="Add a note"
					multiline
					placeholder="E.g. what you found, or what's needed next time"
				/>
				<Button type="submit" variant="outline" size="lg" class="h-12" disabled={!!addNote.pending}>
					{#if addNote.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Add note
				</Button>
			</form>
		{/if}
	</Card.Content>
</Card.Root>

{#if actions.work}
	<Card.Root>
		<Card.Header>
			<Card.Title>Complete the job</Card.Title>
			<Card.Description>Ask the customer to check the work and sign.</Card.Description>
		</Card.Header>
		<Card.Content>
			<CompleteForm orderId={order.id} contactName={customer.contactName} />
		</Card.Content>
	</Card.Root>
{:else if data.signoff}
	<Card.Root>
		<Card.Header>
			<Card.Title>Signed off</Card.Title>
			<Card.Description>
				By {data.signoff.signerName}, {formatDate(data.signoff.signedAt)}
				{formatTime(data.signoff.signedAt)}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<img
				src={data.signoff.signature}
				alt="Signature of {data.signoff.signerName}"
				class="h-32 w-full rounded-lg border bg-white object-contain"
			/>
		</Card.Content>
	</Card.Root>
{/if}
