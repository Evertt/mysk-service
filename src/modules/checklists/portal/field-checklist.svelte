<!--
	@component
	One unit's checklist on the engineer portal, filled in on a phone: its points under their groups,
	three big buttons each (Goed, Afkeur, N.v.t.), the remark a rejection needs, the general remark for
	the customer, and "Complete" once every point is answered. Each answer is saved as it's given, in
	the order given; one that fails to save is taken back and said so. Completed, or when the order
	isn't in progress, it shows what was found.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleMinusIcon from "@lucide/svelte/icons/circle-minus";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { errorMessage } from "#lib/utils.ts";

	import ChecklistPoints from "../detail/checklist-points.svelte";
	import { checklistLabels } from "../labels.ts";
	import {
		canComplete,
		completionProblems,
		isAnswered,
		type PointResult,
		pointResults,
		progress,
	} from "../model.ts";
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
			unit: {
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

	// What the engineer gives, kept here as they go: the card shows their answers as soon as they're
	// given, whatever the server's copy (which they're saved into) says by then.
	const points = $state(untrack(() => checklist.results.map((point) => ({ ...point }))));
	let remarks = $state(untrack(() => checklist.remarks ?? ""));
	let saving = $state(0);
	let completing = $state(false);
	/** Whether "Complete" was tried, to show what's missing. */
	let tried = $state(false);

	const editable = $derived(canChange && checklist.status === "draft");
	const counts = $derived(progress(points));
	const ready = $derived(canComplete(points));
	const groups = $derived([...Map.groupBy(points, (point) => point.group)]);

	/** Saves run one after another, so the last answer given is the one that stays. */
	let queue: Promise<unknown> = Promise.resolve();
	function enqueue(save: () => Promise<unknown>, undo: () => void) {
		saving++;
		queue = queue
			.then(save)
			.catch((error) => {
				undo();
				toast.error(errorMessage(error, m.checklists_save_failed()));
			})
			.finally(() => saving--);
	}

	function setResult(point: Point, result: PointResult) {
		if (point.result === result) return;
		const before = point.result;
		point.result = result;
		enqueue(
			() => answer({ id: point.id, result }),
			() => (point.result = before),
		);
	}

	/** Remarks are saved a moment after typing stops, and when the field is left. */
	// Plain records: what's pending to save shows nowhere.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function later(key: string, save: () => void) {
		clearTimeout(timers[key]);
		timers[key] = setTimeout(() => {
			delete timers[key];
			save();
		}, 800);
	}
	function now(key: string, save: () => void) {
		if (!(key in timers)) return;
		clearTimeout(timers[key]);
		delete timers[key];
		save();
	}

	/** What the server has of each point's remark, to save only a change. */
	const saved: Record<number, string> = Object.fromEntries(
		untrack(() => checklist.results.map((point) => [point.id, point.remark ?? ""])),
	);
	function saveRemark(point: Point) {
		const remark = point.remark ?? "";
		const before = saved[point.id] ?? "";
		if (remark === before) return;
		saved[point.id] = remark;
		// A remark that fails to save stays as typed, and is saved again when it's changed.
		enqueue(
			() => remarkOn({ id: point.id, remark }),
			() => (saved[point.id] = before),
		);
	}

	let savedRemarks = untrack(() => checklist.remarks ?? "");
	function saveRemarks() {
		if (remarks === savedRemarks) return;
		const before = savedRemarks;
		savedRemarks = remarks;
		enqueue(
			() => remarkForCustomer({ id: checklist.id, remarks }),
			() => (savedRemarks = before),
		);
	}

	async function completeIt() {
		tried = true;
		if (!ready) return;
		// What's typed but not saved yet goes first.
		for (const point of points) now(`point-${point.id}`, () => saveRemark(point));
		now("remarks", saveRemarks);
		completing = true;
		try {
			await queue;
			await complete({ id: checklist.id });
			toast.success(m.checklists_completed_toast({ unit: unitTitle(checklist.unit) }));
		} catch (error) {
			toast.error(errorMessage(error, m.checklists_save_failed()));
		} finally {
			completing = false;
		}
	}

	const icons = { ok: CircleCheckIcon, nok: CircleXIcon, na: CircleMinusIcon };
	// Strong once picked, over the outline button's own background and hover.
	const tones: Record<PointResult, string> = {
		ok: "aria-pressed:border-emerald-600! aria-pressed:bg-emerald-600! aria-pressed:text-white! dark:aria-pressed:bg-emerald-500!",
		nok: "aria-pressed:border-destructive! aria-pressed:bg-destructive! aria-pressed:text-white!",
		na: "aria-pressed:border-foreground! aria-pressed:bg-foreground! aria-pressed:text-background!",
	};
	const problems = $derived(completionProblems(points));
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
						answered: formatNumber(counts.answered),
						total: formatNumber(counts.total),
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
						name: checklist.engineer ?? m.checklists_someone(),
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
						{@const missing = tried && !isAnswered(point)}
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
										onclick={() => setResult(point, result)}
									>
										<Icon data-icon="inline-start" />
										{checklistLabels.label("pointResult", result)}
									</Button>
								{/each}
							</div>
							{#if point.result === "nok"}
								<Textarea
									bind:value={
										() => point.remark ?? "",
										(value) => {
											point.remark = value;
											later(`point-${point.id}`, () => saveRemark(point));
										}
									}
									onblur={() => now(`point-${point.id}`, () => saveRemark(point))}
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
					bind:value={
						() => remarks,
						(value) => {
							remarks = value;
							later("remarks", saveRemarks);
						}
					}
					onblur={() => now("remarks", saveRemarks)}
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
					disabled={completing}
					onclick={completeIt}
				>
					<CircleCheckIcon data-icon="inline-start" />
					{m.checklists_complete()}
				</Button>
				<p class="text-xs text-muted-foreground" aria-live="polite" data-save-state>
					{#if tried && problems.unanswered}
						<span class="text-destructive">
							{m.checklists_complete_unanswered({ count: problems.unanswered })}
						</span>
					{:else if tried && problems.unexplained}
						<span class="text-destructive">
							{m.checklists_complete_unexplained({ count: problems.unexplained })}
						</span>
					{:else if saving}
						{m.checklists_saving()}
					{:else}
						{m.checklists_saved_as_you_go()}
					{/if}
				</p>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
