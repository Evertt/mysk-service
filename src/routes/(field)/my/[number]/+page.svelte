<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import MailIcon from "@lucide/svelte/icons/mail";
	import PhoneIcon from "@lucide/svelte/icons/phone";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { toast } from "svelte-sonner";

	import DetailItem from "#lib/components/detail-item.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { SiteCard } from "#lib/customers/components.ts";
	import { getTimeZone } from "#lib/dates.ts";
	import { unitModel, unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDateTime, formatNumber, formatTime } from "#lib/i18n/index.ts";
	import { PriorityBadge, StatusBadge, TypeLabel } from "#lib/orders/components.ts";
	import { fieldActions } from "#lib/orders/index.ts";
	import { order as orderParts } from "#lib/portal/extensions.ts";

	import { refreshOnChanges } from "../live.svelte.ts";
	import { getMe, getMyOrder, startWork } from "../portal.remote.ts";
	import { dayLabel } from "../work.ts";
	import type { PageProps } from "./$types";
	import CompleteForm from "./complete-form.svelte";
	import HoursForm from "./hours-form.svelte";
	import NotesCard from "./notes-card.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getMyOrder(params.number));
	const order = $derived(data.order);
	const { customer } = $derived(data.order);
	const actions = $derived(fieldActions(order.status));
	const me = $derived(await getMe());

	// How often the modules' cards changed what the order may do (`changed()` of `portal.order`).
	let partsChanged = $state(0);

	// Live: the office rescheduling, changing or cancelling the order shows without a reload (one
	// taken off the engineer is a 404 then, as on a reload).
	refreshOnChanges(() => getMyOrder(params.number).refresh());
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
				{dayLabel(order.scheduledFor.toZonedDateTimeISO(getTimeZone()).toPlainDate())}, {formatTime(
					order.scheduledFor,
				)}
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
		<SubmitButton
			size="lg"
			class="h-12 w-full text-base"
			icon={PlayIcon}
			pending={startWork.pending}
		>
			{m.portal_start_job()}
		</SubmitButton>
		<Field.FieldError errors={startWork.fields.allIssues()} class="mt-2" />
	</form>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_job()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<p class="whitespace-pre-line">{order.description}</p>
		{#if order.units.length === 1}
			{@const [unit] = order.units}
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem
					label={m.portal_equipment()}
					value={unit.name ? `${unit.name} · ${unitModel(unit)}` : unitModel(unit)}
				/>
				<DetailItem label={m.portal_serial_number()} value={unit.serialNumber} />
				{#if unit.location}
					<DetailItem label={m.portal_location()} value={unit.location} />
				{/if}
			</dl>
		{:else if order.units.length}
			<!-- In the order they're worked on, with where each one is. -->
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">
					{m.common_count_units({ count: order.units.length })}
				</h2>
				<ol class="flex flex-col divide-y rounded-md border" aria-label={m.portal_equipment()}>
					{#each order.units as unit, index (unit.id)}
						<li class="flex gap-3 px-3 py-2 text-sm">
							<span class="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
								{formatNumber(index + 1)}
							</span>
							<div class="flex min-w-0 flex-col">
								<span class="font-medium">{unitTitle(unit)}</span>
								<span class="text-muted-foreground">
									{[unit.name ? unitModel(unit) : null, unit.serialNumber, unit.category.name]
										.filter(Boolean)
										.join(" · ")}
								</span>
								{#if unit.location || data.sites.length > 1}
									<span class="text-muted-foreground">
										{[data.sites.length > 1 ? unit.site.name : null, unit.location]
											.filter(Boolean)
											.join(" · ")}
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			</div>
		{:else}
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.portal_equipment()} value={m.portal_new_installation()} />
			</dl>
		{/if}
	</Card.Content>
</Card.Root>

{#each data.sites as site (site.id)}
	<SiteCard {site} title={m.portal_site()} />
{/each}

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
			<HoursForm orderId={order.id} hours={order.laborHours} />
		{:else}
			<p class="text-lg tabular-nums">{m.common_count_hours_short({ count: order.laborHours })}</p>
		{/if}
	</Card.Content>
</Card.Root>

<ExtensionSlot point={orderParts} props={{ number: order.number, changed: () => partsChanged++ }} />

<NotesCard orderId={order.id} notes={data.notes} canAdd={actions.note} />

{#if actions.work}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.portal_complete_title()}</Card.Title>
			<Card.Description>{m.portal_complete_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<CompleteForm
				orderId={order.id}
				contactName={customer.contactName}
				engineerName={me.name}
				{partsChanged}
			/>
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
		<Card.Content class="flex flex-col gap-3">
			<img
				src={data.signoff.signature}
				alt={m.portal_signature_of({ name: data.signoff.signerName })}
				class="h-32 w-full rounded-lg border bg-white object-contain"
			/>
			<!-- The engineer's own, on sign-offs since engineers sign too. -->
			{#if data.signoff.engineerName && data.signoff.engineerSignature}
				<p class="text-sm text-muted-foreground">
					{m.portal_engineer_signed({ name: data.signoff.engineerName })}
				</p>
				<img
					src={data.signoff.engineerSignature}
					alt={m.portal_signature_of({ name: data.signoff.engineerName })}
					class="h-32 w-full rounded-lg border bg-white object-contain"
				/>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
