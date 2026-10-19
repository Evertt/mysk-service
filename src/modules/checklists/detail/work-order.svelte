<!--
	@component
	An order's work order (werkbon), laid out for A4: the order, the customer and where the work was,
	its units, every unit's checklist with its points under their groups and the remarks, and the
	signatures of the engineer and the customer. Prints without the app's shell (the page's print
	styles).
-->
<script lang="ts">
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { formatDate, formatDateTime, formatNumber, label } from "#lib/i18n/index.ts";

	import { completerName } from "../display.ts";
	import { checklistLabels } from "../labels.ts";
	import type { WorkOrder } from "../server/work-order.ts";
	import OutcomeBadge from "../ui/outcome-badge.svelte";
	import ChecklistPoints from "./checklist-points.svelte";

	let { data }: { data: WorkOrder } = $props();

	const order = $derived(data.order);
	const signatures = $derived([
		{
			key: "engineer",
			title: m.checklists_signature_engineer(),
			name: data.signoff?.engineerName ?? null,
			image: data.signoff?.engineerSignature ?? null,
		},
		{
			key: "customer",
			title: m.checklists_signature_customer(),
			name: data.signoff?.signerName ?? null,
			image: data.signoff?.signature ?? null,
		},
	]);
</script>

<article class="work-order flex flex-col gap-6 text-sm" data-work-order={order.number}>
	<header class="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground uppercase">{data.organization}</span>
			<h1 class="text-2xl font-semibold tracking-tight">
				{m.checklists_work_order()}
				{order.number}
			</h1>
			<p class="text-muted-foreground">{order.description}</p>
		</div>
		<dl class="grid grid-cols-2 gap-x-6 gap-y-1">
			<dt class="text-muted-foreground">{m.checklists_print_type()}</dt>
			<dd>{label("orderType", order.type)}</dd>
			<dt class="text-muted-foreground">{m.checklists_print_status()}</dt>
			<dd>{label("orderStatus", order.status)}</dd>
			<dt class="text-muted-foreground">{m.checklists_print_date()}</dt>
			<dd class="tabular-nums">
				{order.completedAt
					? formatDate(order.completedAt)
					: order.scheduledFor
						? formatDate(order.scheduledFor)
						: "—"}
			</dd>
			<dt class="text-muted-foreground">{m.checklists_print_engineer()}</dt>
			<dd>{order.engineer ?? "—"}</dd>
		</dl>
	</header>

	<section class="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-xs font-medium text-muted-foreground uppercase">
				{m.checklists_print_customer()}
			</h2>
			<p class="font-medium">{order.customer.name}</p>
			<p>{order.customer.contactName}</p>
		</div>
		<!-- Without units, a site is known only when the customer has just one. -->
		{#if data.sites.length}
			<div class="flex flex-col gap-0.5">
				<h2 class="text-xs font-medium text-muted-foreground uppercase">
					{m.checklists_print_site()}
				</h2>
				{#each data.sites as site (site.id)}
					<p>
						<span class="font-medium">{site.name}</span>{site.address ? `, ${site.address}` : ""}, {[
							site.postalCode,
							site.city,
						]
							.filter(Boolean)
							.join(" ")}
					</p>
				{/each}
			</div>
		{/if}
	</section>

	{#if data.units.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-base font-semibold">
				{m.common_count_units({ count: data.units.length })}
			</h2>
			<table class="w-full border-collapse text-left">
				<thead class="text-xs text-muted-foreground">
					<tr class="border-b">
						<th class="py-1 pr-2 font-medium">#</th>
						<th class="py-1 pr-2 font-medium">{m.checklists_print_unit()}</th>
						<th class="py-1 pr-2 font-medium">{m.checklists_print_location()}</th>
						<th class="py-1 font-medium">{m.checklists_print_outcome()}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.units as unit, index (unit.id)}
						{@const unitChecklist = data.checklists.find((each) => each.unit.id === unit.id)}
						<tr class="border-b align-top">
							<td class="py-1 pr-2 tabular-nums">{formatNumber(index + 1)}</td>
							<td class="py-1 pr-2">
								<span class="font-medium">{unitTitle(unit)}</span>
								<span class="block text-muted-foreground">{unitLine(unit)}</span>
							</td>
							<td class="py-1 pr-2">{unit.location ?? "—"}</td>
							<td class="py-1">
								{#if unitChecklist}<OutcomeBadge checklist={unitChecklist} />{:else}—{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	{#each data.checklists as checklist (checklist.id)}
		<section
			class="checklist flex flex-col gap-3 rounded-lg border p-4"
			data-checklist={checklist.unit.serialNumber}
		>
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div class="flex flex-col">
					<h2 class="text-base font-semibold">{unitTitle(checklist.unit)}</h2>
					<span class="text-xs text-muted-foreground">
						{checklistLabels.label("checklistKind", checklist.kind)} · {checklist.name}{checklist.norm
							? ` · ${checklist.norm}`
							: ""} · {checklist.unit.serialNumber}
					</span>
				</div>
				<div class="flex flex-col items-end gap-1">
					<OutcomeBadge {checklist} />
					{#if checklist.completedAt}
						<span class="text-xs text-muted-foreground tabular-nums">
							{m.checklists_completed_by({
								name: completerName(checklist) ?? m.checklists_someone(),
								date: formatDateTime(checklist.completedAt),
							})}
						</span>
					{/if}
					{#if checklist.validUntil}
						<span class="text-xs text-muted-foreground tabular-nums">
							{m.checklists_valid_until({ date: formatDate(checklist.validUntil) })}
						</span>
					{/if}
				</div>
			</div>
			<ChecklistPoints results={checklist.results} remarks={checklist.remarks} grouped />
		</section>
	{/each}

	<section class="signatures grid gap-4 sm:grid-cols-2 print:grid-cols-2" data-signatures>
		{#each signatures as signature (signature.key)}
			<div class="flex flex-col gap-2 rounded-lg border p-4" data-signature={signature.key}>
				<h2 class="text-xs font-medium text-muted-foreground uppercase">{signature.title}</h2>
				{#if signature.image}
					<img
						src={signature.image}
						alt={m.checklists_signature_of({ name: signature.name ?? "" })}
						class="h-28 w-full rounded border bg-white object-contain"
					/>
					<p>
						<span class="font-medium">{signature.name}</span>
						{#if data.signoff}
							<span class="text-muted-foreground tabular-nums">
								· {formatDateTime(data.signoff.signedAt)}</span
							>
						{/if}
					</p>
				{:else}
					<div class="h-28 rounded border border-dashed"></div>
					<p class="text-muted-foreground">{m.checklists_not_signed()}</p>
				{/if}
			</div>
		{/each}
	</section>
</article>

<style>
	@media print {
		.checklist,
		.signatures,
		tr {
			break-inside: avoid;
		}
	}
</style>
