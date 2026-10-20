<!--
	@component
	A unit's checklist on the work orders page ("Werkbon Keuring 2026"), as the mockup lays it out at
	a desk: its order, a progress bar, each point under its group with Goed, Afkeur and N.v.t. beside
	it and the remark a rejection needs, the general remark for the customer, and "Afronden &
	vastleggen". A draft on an open order is filled in here for the engineer (a paper form brought
	back), each answer saved as it's given (`checklistDraft()`, as in the portal), and completed by
	the same rules; otherwise it shows what was found and who completed it. For a component, only the
	points that check it, with the score they give it, and how many others are hidden.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import LockIcon from "@lucide/svelte/icons/lock";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import XIcon from "@lucide/svelte/icons/x";
	import { toast } from "svelte-sonner";

	import { getTimeZone } from "#lib/dates.ts";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDateTime, formatNumber, label } from "#lib/i18n/index.ts";
	import { isOpenOrder, type OrderStatus } from "#lib/models.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import type { UnitComponent } from "../api/extensions.ts";
	import { checklistDraft } from "../detail/checklist-draft.svelte.ts";
	import ChecklistPoints from "../detail/checklist-points.svelte";
	import { completerName, pickedResultClasses } from "../display.ts";
	import { checklistLabels } from "../labels.ts";
	import {
		checklistScore,
		componentPoints,
		isAnswered,
		type PointResult,
		pointResults,
		progress,
	} from "../model.ts";
	import OutcomeBadge from "../ui/outcome-badge.svelte";
	import {
		officeAnswer,
		officeComplete,
		officeRemarkForCustomer,
		officeRemarkOn,
	} from "./assets.remote.ts";
	import type { PageUpdates } from "./selection.ts";

	interface Point {
		id: number;
		group: string;
		text: string;
		result: PointResult | null;
		remark: string | null;
		templateItemId: number | null;
	}

	let {
		checklist,
		component,
		updates,
	}: {
		checklist: {
			id: number;
			name: string;
			norm: string | null;
			kind: "inspection" | "maintenance";
			status: "draft" | "completed";
			remarks: string | null;
			completedAt: Temporal.Instant | null;
			date: Temporal.Instant;
			engineer: string | null;
			office: string | null;
			order: { number: string; status: OrderStatus };
			unit: { name: string | null; manufacturer: string; model: string };
			results: Point[];
		};
		/** The component it's narrowed to, if any. */
		component?: UnitComponent;
		/** The page's queries a completion changes: the list's badge, the unit's checklists, the scores. */
		updates: () => PageUpdates;
	} = $props();

	const draft = checklistDraft(() => checklist, {
		answer: officeAnswer,
		remarkOn: officeRemarkOn,
		remarkForCustomer: officeRemarkForCustomer,
		complete: (input) => officeComplete(input).updates(...updates()),
	});

	const open = $derived(isOpenOrder(checklist.order.status));
	const editable = $derived(checklist.status === "draft" && open);
	const year = $derived(checklist.date.toZonedDateTimeISO(getTimeZone()).year);
	/** The points shown: the component's, or all. */
	const shown = $derived(
		component
			? componentPoints(draft.points, component.templateItemIds)
			: { points: draft.points, others: 0 },
	);
	const shownResults = $derived(
		component
			? componentPoints(checklist.results, component.templateItemIds).points
			: checklist.results,
	);
	const counts = $derived(progress(shown.points));
	const groups = $derived([...Map.groupBy(shown.points, (point) => point.group)]);
	const score = $derived(component ? checklistScore(editable ? shown.points : shownResults) : null);

	async function completeIt() {
		if (await draft.complete()) {
			toast.success(m.checklists_completed_toast({ unit: unitTitle(checklist.unit) }));
		}
	}

	const icons = { ok: CheckIcon, nok: XIcon, na: MinusIcon };
</script>

<Card.Root
	class={editable ? "border-2 border-primary" : ""}
	data-office-checklist={checklist.id}
	data-status={checklist.status}
>
	<Card.Header>
		<Card.Title class="text-lg">
			{m.checklists_assets_checklist_title({
				kind: checklistLabels.label("checklistKind", checklist.kind),
				year: String(year),
			})}
		</Card.Title>
		<Card.Description class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<span>{checklist.name}{checklist.norm ? ` · ${checklist.norm}` : ""}</span>
			<span aria-hidden="true">·</span>
			<OrderLink
				number={checklist.order.number}
				class="font-medium text-primary underline-offset-4 hover:underline"
				data-checklist-order
			>
				{m.checklists_assets_order({ number: checklist.order.number })}
			</OrderLink>
			<Badge variant="outline">{label("orderStatus", checklist.order.status)}</Badge>
		</Card.Description>
		<Card.Action>
			{#if checklist.status === "completed"}
				<OutcomeBadge checklist={{ status: checklist.status, results: shownResults }} />
			{:else}
				<span class="text-sm text-muted-foreground tabular-nums" data-progress>
					{m.checklists_progress({
						answered: formatNumber(counts.answered),
						total: formatNumber(counts.total),
					})}
				</span>
			{/if}
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if checklist.status === "draft"}
			<div
				class="h-1.5 overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={counts.total}
				aria-valuenow={counts.answered}
				aria-label={m.checklists_progress({
					answered: formatNumber(counts.answered),
					total: formatNumber(counts.total),
				})}
			>
				<div
					class="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
					style:width="{counts.total ? (100 * counts.answered) / counts.total : 0}%"
				></div>
			</div>
		{/if}

		{#if component}
			<div
				class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
				data-component-score
			>
				<span>
					<span class="text-muted-foreground">{component.number}</span>
					{component.name} · {m.checklists_assets_component_score()}
				</span>
				<span class="font-semibold tabular-nums">
					{score === null
						? m.checklists_no_score()
						: m.checklists_score({ score: formatNumber(score) })}
				</span>
			</div>
		{/if}

		{#if !editable}
			{#if checklist.status === "completed" && checklist.completedAt}
				<p class="text-sm text-muted-foreground" data-completed-by>
					{m.checklists_completed_by({
						name: completerName(checklist) ?? m.checklists_someone(),
						date: formatDateTime(checklist.completedAt),
					})}
				</p>
			{:else if !open}
				<p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
					{m.checklists_office_closed_note({ number: checklist.order.number })}
				</p>
			{/if}
			<ChecklistPoints
				results={shownResults}
				remarks={component ? null : checklist.remarks}
				grouped
			/>
		{:else}
			<div class="flex flex-col divide-y">
				{#each groups as [group, items] (group)}
					<fieldset class="flex flex-col divide-y" data-group={group}>
						{#if group}
							<legend
								class="pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
							>
								{group}
							</legend>
						{/if}
						{#each items as point (point.id)}
							{@const missing = draft.tried && !isAnswered(point)}
							<div class="grid gap-2 py-3 md:grid-cols-[1fr_auto]" data-point={point.text}>
								<div class="flex min-w-0 flex-col gap-2">
									<p
										class={["text-sm", missing && "text-destructive"]}
										id={`office-point-${point.id}`}
									>
										{point.text}
									</p>
									{#if point.result === "nok"}
										<Textarea
											bind:value={
												() => point.remark ?? "", (value) => draft.setRemark(point, value)
											}
											onblur={() => draft.flushRemark(point)}
											rows={1}
											maxlength={500}
											class="min-h-9 border-destructive/40 bg-destructive/5"
											placeholder={m.checklists_remark_placeholder()}
											aria-label={m.checklists_remark_label({ point: point.text })}
											aria-invalid={missing || undefined}
										/>
										{#if missing}
											<p class="text-xs text-destructive">{m.checklists_remark_required()}</p>
										{/if}
									{/if}
								</div>
								<div
									class="flex flex-wrap gap-1 self-start"
									role="group"
									aria-labelledby={`office-point-${point.id}`}
								>
									{#each pointResults as result (result)}
										{@const Icon = icons[result]}
										<Button
											type="button"
											variant="outline"
											size="sm"
											class={["text-xs font-semibold uppercase", pickedResultClasses[result]]}
											aria-pressed={point.result === result}
											onclick={() => draft.setResult(point, result)}
										>
											<Icon data-icon="inline-start" />
											{checklistLabels.label("pointResult", result)}
										</Button>
									{/each}
								</div>
							</div>
						{/each}
					</fieldset>
				{/each}
			</div>

			{#if !component}
				<div class="flex flex-col gap-2">
					<Label for={`office-remarks-${checklist.id}`}>{m.checklists_remarks()}</Label>
					<Textarea
						id={`office-remarks-${checklist.id}`}
						bind:value={draft.remarks}
						onblur={() => draft.flushRemarks()}
						rows={2}
						maxlength={2000}
						placeholder={m.checklists_remarks_placeholder()}
					/>
				</div>
			{/if}

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p class="text-xs text-muted-foreground" aria-live="polite" data-save-state>
					{#if draft.tried && draft.problems.unanswered}
						<span class="text-destructive">
							{m.checklists_complete_unanswered({ count: draft.problems.unanswered })}
						</span>
					{:else if draft.tried && draft.problems.unexplained}
						<span class="text-destructive">
							{m.checklists_complete_unexplained({ count: draft.problems.unexplained })}
						</span>
					{:else if draft.saving}
						{m.checklists_saving()}
					{:else}
						{m.checklists_office_fill_note()}
					{/if}
				</p>
				<Button type="button" disabled={draft.completing} onclick={completeIt}>
					<LockIcon data-icon="inline-start" />
					{m.checklists_finalize()}
				</Button>
			</div>
		{/if}

		{#if shown.others}
			<p class="text-xs text-muted-foreground" data-other-points>
				{m.checklists_assets_other_points({ count: shown.others })}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
