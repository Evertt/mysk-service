<!--
	@component
	One unit's checklist on the engineer portal, filled in on a phone: its points under their groups,
	three big buttons each (Goed, Afkeur, N.v.t.), the remark a rejection needs, the general remark for
	the customer, and "Complete" once every point is answered. Each answer is saved as it's given, in
	the order given; one that fails to save is taken back and said so (`checklistDraft()`). Completed,
	or when the order isn't in progress, it shows what was found. Below it, what the modules that
	enhance checklists ask about the unit (`checklists.field.checklist`), e.g. its condition once the
	checklist is done.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleMinusIcon from "@lucide/svelte/icons/circle-minus";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import { toast } from "svelte-sonner";

	import { unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDateTime, formatNumber } from "#lib/i18n/index.ts";

	import { fieldChecklist } from "../api/extensions.ts";
	import { checklistDraft } from "../detail/checklist-draft.svelte.ts";
	import ChecklistPoints from "../detail/checklist-points.svelte";
	import { completerName } from "../display.ts";
	import { checklistLabels } from "../labels.ts";
	import { isAnswered, type PointResult, pointResults } from "../model.ts";
	import OutcomeBadge from "../ui/outcome-badge.svelte";
	import { answer, complete, remarkForCustomer, remarkOn } from "./field-checklists.remote.ts";

	interface Point {
		id: number;
		group: string;
		text: string;
		result: PointResult | null;
		remark: string | null;
	}

	let {
		checklist,
		canChange,
	}: {
		checklist: {
			id: number;
			name: string;
			norm: string | null;
			kind: "inspection" | "maintenance";
			status: "draft" | "completed";
			remarks: string | null;
			completedAt: Temporal.Instant | null;
			engineer: string | null;
			office: string | null;
			order: { number: string };
			unit: {
				id: number;
				name: string | null;
				manufacturer: string;
				model: string;
				serialNumber: string;
				location: string | null;
			};
			results: Point[];
		};
		canChange: boolean;
	} = $props();

	// What the engineer gives, kept here as they go (see `checklistDraft()`).
	const draft = checklistDraft(() => checklist, {
		answer,
		remarkOn,
		remarkForCustomer,
		complete,
	});

	const editable = $derived(canChange && checklist.status === "draft");
	const groups = $derived([...Map.groupBy(draft.points, (point) => point.group)]);

	async function completeIt() {
		if (await draft.complete()) {
			toast.success(m.checklists_completed_toast({ unit: unitTitle(checklist.unit) }));
		}
	}

	const icons = { ok: CircleCheckIcon, nok: CircleXIcon, na: CircleMinusIcon };
	// Strong once picked, over the outline button's own background and hover.
	const tones: Record<PointResult, string> = {
		ok: "aria-pressed:border-emerald-600! aria-pressed:bg-emerald-600! aria-pressed:text-white! dark:aria-pressed:bg-emerald-500!",
		nok: "aria-pressed:border-destructive! aria-pressed:bg-destructive! aria-pressed:text-white!",
		na: "aria-pressed:border-foreground! aria-pressed:bg-foreground! aria-pressed:text-background!",
	};
</script>

<Card.Root data-field-checklist={checklist.unit.serialNumber}>
	<Card.Header>
		<Card.Title>{unitTitle(checklist.unit)}</Card.Title>
		<Card.Description>
			{checklist.name}{checklist.norm ? ` · ${checklist.norm}` : ""} · {checklistLabels.label(
				"checklistKind",
				checklist.kind,
			)}
		</Card.Description>
		<Card.Action>
			{#if checklist.status === "completed"}
				<OutcomeBadge {checklist} />
			{:else}
				<span class="text-sm font-medium tabular-nums" data-progress>
					{m.checklists_progress({
						answered: formatNumber(draft.counts.answered),
						total: formatNumber(draft.counts.total),
					})}
				</span>
			{/if}
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-5">
		{#if !editable}
			{#if checklist.status === "completed" && checklist.completedAt}
				<p class="text-sm text-muted-foreground">
					{m.checklists_completed_by({
						name: completerName(checklist) ?? m.checklists_someone(),
						date: formatDateTime(checklist.completedAt),
					})}
				</p>
			{/if}
			<ChecklistPoints results={checklist.results} remarks={checklist.remarks} grouped />
		{:else}
			{#each groups as [group, items] (group)}
				<fieldset class="flex flex-col gap-4" data-group={group}>
					{#if group}
						<legend class="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{group}
						</legend>
					{/if}
					{#each items as point (point.id)}
						{@const missing = draft.tried && !isAnswered(point)}
						<div class="flex flex-col gap-2" data-point={point.text}>
							<p class={["text-sm", missing && "text-destructive"]} id={`point-${point.id}`}>
								{point.text}
							</p>
							<div
								class="grid grid-cols-3 gap-2"
								role="group"
								aria-labelledby={`point-${point.id}`}
							>
								{#each pointResults as result (result)}
									{@const Icon = icons[result]}
									<Button
										type="button"
										variant="outline"
										class={["h-12 px-2 text-sm", tones[result]]}
										aria-pressed={point.result === result}
										onclick={() => draft.setResult(point, result)}
									>
										<Icon data-icon="inline-start" />
										{checklistLabels.label("pointResult", result)}
									</Button>
								{/each}
							</div>
							{#if point.result === "nok"}
								<Textarea
									bind:value={() => point.remark ?? "", (value) => draft.setRemark(point, value)}
									onblur={() => draft.flushRemark(point)}
									rows={2}
									maxlength={500}
									placeholder={m.checklists_remark_placeholder()}
									aria-label={m.checklists_remark_label({ point: point.text })}
									aria-invalid={missing || undefined}
								/>
								{#if missing}
									<p class="text-sm text-destructive">{m.checklists_remark_required()}</p>
								{/if}
							{/if}
						</div>
					{/each}
				</fieldset>
			{/each}
			<div class="flex flex-col gap-2">
				<Label for={`remarks-${checklist.id}`}>{m.checklists_remarks()}</Label>
				<Textarea
					id={`remarks-${checklist.id}`}
					bind:value={draft.remarks}
					onblur={() => draft.flushRemarks()}
					rows={3}
					maxlength={2000}
					placeholder={m.checklists_remarks_placeholder()}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Button
					type="button"
					size="lg"
					class="h-12 text-base"
					disabled={draft.completing}
					onclick={completeIt}
				>
					<CircleCheckIcon data-icon="inline-start" />
					{m.checklists_complete()}
				</Button>
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
						{m.checklists_saved_as_you_go()}
					{/if}
				</p>
			</div>
		{/if}
		<ExtensionSlot
			point={fieldChecklist}
			props={{
				number: checklist.order.number,
				equipmentId: checklist.unit.id,
				completed: checklist.status === "completed",
				canChange,
			}}
		/>
	</Card.Content>
</Card.Root>
