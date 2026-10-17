<!--
	@component
	The checklists module's card on an order's page in the customer portal (`client.order`,
	`#lib/client/extensions.ts`): each of the customer's units' checklist with its outcome and, once
	answered, its points and the remark for the customer; and, once the order is done, its work
	order to print. Nothing for an order without checklists.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import { unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { isDoneOrder } from "#lib/models.ts";

	import { clientRejected } from "../../api/extensions.ts";
	import { getClientOrderChecklists } from "../../client/client-checklists.remote.ts";
	import ChecklistPoints from "../../detail/checklist-points.svelte";
	import { checklistLabels } from "../../labels.ts";
	import { progress } from "../../model.ts";
	import OutcomeBadge from "../../ui/outcome-badge.svelte";

	let { number }: { number: string } = $props();

	const data = $derived(await getClientOrderChecklists(number));
	/** The checklists' rejected points, for the modules that suggest what they need. */
	const rejected = $derived(
		data.checklists.flatMap((checklist) =>
			checklist.results.flatMap((point) =>
				point.result === "nok" && point.templateItemId !== null
					? [
							{
								templateItemId: point.templateItemId,
								text: point.text,
								unit: unitTitle(checklist.unit),
								materialId: point.materialId,
							},
						]
					: [],
			),
		),
	);
</script>

{#if data.checklists.length}
	<Card.Root data-client-checklists>
		<Card.Header>
			<Card.Title>{m.checklists_order_title()}</Card.Title>
			<Card.Description>{m.checklists_client_order_description()}</Card.Description>
			{#if isDoneOrder(data.status)}
				<Card.Action>
					<Button
						variant="outline"
						size="sm"
						href={resolve("/(customer)/(modules)/checklists/portal/work-orders/[number]", {
							number,
						})}
					>
						<PrinterIcon data-icon="inline-start" />
						{m.checklists_work_order()}
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col divide-y">
			{#each data.checklists as checklist (checklist.id)}
				{@const counts = progress(checklist.results)}
				<article
					class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
					data-checklist={checklist.unit.serialNumber}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="flex min-w-0 flex-col">
							<span class="truncate font-medium">{unitTitle(checklist.unit)}</span>
							<span class="text-xs text-muted-foreground">
								{checklist.name}{checklist.norm ? ` · ${checklist.norm}` : ""} · {checklistLabels.label(
									"checklistKind",
									checklist.kind,
								)}
							</span>
						</div>
						<OutcomeBadge {checklist} />
					</div>
					<p class="text-xs text-muted-foreground tabular-nums">
						{#if checklist.status === "completed" && checklist.completedAt}
							{m.checklists_completed_by({
								name:
									checklist.engineer?.split(" ")[0] ??
									(checklist.office ? m.checklists_the_office() : m.checklists_someone()),
								date: formatDateTime(checklist.completedAt),
							})}
						{:else}
							{m.checklists_progress({
								answered: formatNumber(counts.answered),
								total: formatNumber(counts.total),
							})}
						{/if}
					</p>
					{#if checklist.status === "completed"}
						<ChecklistPoints results={checklist.results} remarks={checklist.remarks} />
					{/if}
				</article>
			{/each}
		</Card.Content>
	</Card.Root>
	{#if rejected.length}
		<ExtensionSlot point={clientRejected} props={{ number, rejected }} />
	{/if}
{/if}
