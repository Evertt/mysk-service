<!--
	@component
	The selected asset on the work orders page (the mockup's right column): the unit (or one of its
	components) with its template, customer and site, the buttons that start this year's inspection
	or maintenance ("Keuring 2026", "Onderhoud 2026": its order, or the open one it has), its
	checklist of this year (`shownChecklist()`: one asked for, else the open draft, else the latest
	completed this year, else a notice to start one), and "Historie per jaar": the unit's checklists,
	or the component's scores.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import { type ListQuery, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { getTimeZone } from "#lib/dates.ts";
	import { isOpenOrder } from "#lib/models.ts";
	import { errorMessage } from "#lib/utils.ts";

	import ChecklistHistory from "../detail/checklist-history.svelte";
	import { checklistLabels } from "../labels.ts";
	import { type ChecklistKind, checklistKinds, shownChecklist } from "../model.ts";
	import type { assetList } from "./asset-list.ts";
	import {
		getAsset,
		getAssetFacets,
		getAssets,
		getComponentScores,
		startOrder,
	} from "./assets.remote.ts";
	import ComponentHistory from "./component-history.svelte";
	import OfficeChecklist from "./office-checklist.svelte";
	import { pageHref, type PageUpdates } from "./selection.ts";

	let {
		serialNumber,
		componentNumber,
		checklistId,
		listQuery,
	}: {
		serialNumber: string;
		/** The component selected, by its number; none for the unit as a whole. */
		componentNumber: string | null;
		/** The checklist asked for (from its history), if any. */
		checklistId?: number;
		/** The list's query beside it, whose rows and counts a change refreshes. */
		listQuery: ListQuery<typeof assetList.columns>;
	} = $props();

	const data = $derived(await getAsset(serialNumber));
	const component = $derived(
		componentNumber ? data.components.find((part) => part.number === componentNumber) : undefined,
	);
	const checklists = $derived(
		data.checklists.map((checklist) => ({
			...checklist,
			open: isOpenOrder(checklist.order.status),
			completedYear: checklist.completedAt?.toZonedDateTimeISO(getTimeZone()).year ?? null,
		})),
	);
	const shown = $derived(shownChecklist(checklists, data.year, checklistId));
	const place = $derived(
		[data.unit.serialNumber, data.unit.customer.name, data.unit.site.name, data.unit.location]
			.filter(Boolean)
			.join(" · "),
	);

	/** The queries a change on the page refreshes: those it shows, by their arguments. */
	const updates = (): PageUpdates => [
		getAssets(listQuery),
		getAssetFacets(whereOf(listQuery)),
		getAsset(serialNumber),
		...(component ? [getComponentScores({ serialNumber, componentId: component.id })] : []),
	];

	let starting = $state<ChecklistKind>();
	async function start(kind: ChecklistKind) {
		starting = kind;
		try {
			const started = await startOrder({ serialNumber, kind }).updates(...updates());
			toast.success(
				started.created
					? m.checklists_start_created({ number: started.number })
					: m.checklists_start_opened({ number: started.number }),
			);
			if (started.checklistId) {
				await goto(pageHref(page.url, { checklist: String(started.checklistId) }), {
					reset: false,
				});
			}
		} catch (error) {
			toast.error(errorMessage(error, m.common_error_generic()));
		} finally {
			starting = undefined;
		}
	}
</script>

<section class="flex min-w-0 flex-col gap-6" data-asset-panel={data.unit.serialNumber}>
	<Card.Root>
		<!-- Not the card's header: on a phone the buttons go below the title, not beside it. -->
		<Card.Content class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex min-w-0 flex-col gap-1">
				{#if data.template}
					<span class="text-xs font-semibold tracking-wide text-primary uppercase" data-template>
						{data.template.name}{data.template.norm ? ` · ${data.template.norm}` : ""}
					</span>
				{/if}
				{#if component}
					<span class="text-sm text-muted-foreground">
						{m.checklists_assets_component_of({ unit: data.unit.title })}
					</span>
					<Card.Title class="text-xl" data-asset-title>
						{component.number} — {component.name}
					</Card.Title>
				{:else}
					<Card.Title class="text-xl" data-asset-title>
						<a
							class="underline-offset-4 hover:underline"
							href={resolve("/(app)/equipment/[serial]", { serial: data.unit.serialNumber })}
						>
							{data.unit.title}
						</a>
					</Card.Title>
				{/if}
				<Card.Description>{place}</Card.Description>
				{#if component}
					<a
						class="w-fit text-sm text-primary underline-offset-4 hover:underline"
						href={pageHref(page.url, { component: null, checklist: null })}
						data-sveltekit-reset="false"
					>
						{m.checklists_assets_show_unit()}
					</a>
				{/if}
			</div>
			{#if data.template}
				<div class="flex shrink-0 flex-wrap gap-2">
					{#each checklistKinds as kind, index (kind)}
						<Button
							variant={index === 0 ? "default" : "outline"}
							disabled={starting !== undefined}
							onclick={() => start(kind)}
							data-start={kind}
						>
							<PlusIcon data-icon="inline-start" />
							{m.checklists_start_description({
								kind: checklistLabels.label("checklistKind", kind),
								year: String(data.year),
							})}
						</Button>
					{/each}
				</div>
			{/if}
		</Card.Content>
		{#if !data.template || !shown}
			<Card.Content>
				<p
					class="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
					data-asset-notice
				>
					{#if !data.template}
						{m.checklists_assets_no_template({ category: data.unit.category })}
					{:else}
						{m.checklists_assets_none_this_year({ year: String(data.year) })}
					{/if}
				</p>
			</Card.Content>
		{/if}
	</Card.Root>

	{#if shown}
		<!-- Anew for another checklist, and once it's completed: it shows what's on record then. -->
		{#key `${shown.id}-${shown.status}`}
			<OfficeChecklist checklist={shown} {component} {updates} />
		{/key}
	{/if}

	<Card.Root data-asset-history>
		<Card.Header>
			<Card.Title>{m.checklists_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if component}
				<ComponentHistory {serialNumber} componentId={component.id} />
			{:else if checklists.length}
				<ChecklistHistory
					{checklists}
					current={shown?.id}
					href={(checklist) => pageHref(page.url, { checklist: String(checklist.id) })}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">{m.checklists_history_empty()}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
