<!--
	@component
	The checklists module's card on an order's page in the customer portal (`client.order`,
	`#lib/client/extensions.ts`): each of the customer's units' completed checklist with its outcome,
	who completed it, its points and the remark for the customer; and, once the order is done, its
	work order to print. Nothing for an order without completed checklists.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import { unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDateTime } from "#lib/i18n/index.ts";
	import { isDoneOrder } from "#lib/models.ts";

	import { clientRejected } from "../../api/extensions.ts";
	import { getClientOrderChecklists } from "../../client/client-checklists.remote.ts";
	import ChecklistPoints from "../../detail/checklist-points.svelte";
	import { completerName } from "../../display.ts";
	import { checklistLabels } from "../../labels.ts";
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
					{#if checklist.completedAt}
						<p class="text-xs text-muted-foreground tabular-nums">
							{m.checklists_completed_by({
								name: completerName(checklist) ?? m.checklists_someone(),
								date: formatDateTime(checklist.completedAt),
							})}
						</p>
					{/if}
					<ChecklistPoints results={checklist.results} remarks={checklist.remarks} />
				</article>
			{/each}
		</Card.Content>
	</Card.Root>
	{#if rejected.length}
		<ExtensionSlot point={clientRejected} props={{ number, rejected }} />
	{/if}
{/if}
