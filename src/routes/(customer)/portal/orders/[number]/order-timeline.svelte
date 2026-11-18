<!--
	@component
	An order's progress on its page in the customer portal, as a vertical stepper: received by the
	tenant, an engineer scheduled, the engineer on the way, resolved, each with when it happened
	where that's known; a report rejected (with the planner's reason) or an order cancelled ends it
	after received. The steps are `timelineSteps()`'s.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import XIcon from "@lucide/svelte/icons/x";

	import { formatDate, formatDateTime } from "#lib/i18n/index.ts";
	import { cn } from "#lib/utils.ts";

	import {
		type StepDetail,
		type StepState,
		type TimelineOrder,
		type TimelineStepKey,
		timelineSteps,
	} from "./timeline.ts";

	let {
		order,
	}: {
		/** The order as the portal reads it, with who received it. */
		order: TimelineOrder & { organization: string; reportedBy: string | null };
	} = $props();

	const steps = $derived(timelineSteps(order));

	/** A step's title. */
	function title(key: TimelineStepKey) {
		switch (key) {
			case "received":
				return order.reportedBy
					? m.client_timeline_received({ organization: order.organization })
					: m.client_timeline_created();
			case "scheduled":
				return m.client_timeline_scheduled();
			case "on_the_way":
				return m.client_timeline_on_the_way();
			case "resolved":
				return m.client_timeline_resolved();
			case "rejected":
				return m.client_timeline_rejected();
			case "cancelled":
				return m.client_timeline_cancelled();
		}
	}

	/** What a step says under its title. */
	function details(detail: StepDetail): string[] {
		switch (detail?.kind) {
			case undefined:
				return [];
			case "awaiting":
				return [m.client_timeline_awaiting({ organization: order.organization })];
			case "accepted":
				return detail.at ? [m.client_timeline_accepted({ date: formatDate(detail.at) })] : [];
			case "planned":
				return [
					...(detail.at
						? [m.client_timeline_planned_for({ when: formatDateTime(detail.at) })]
						: []),
					...(detail.engineer ? [m.client_timeline_engineer({ name: detail.engineer })] : []),
				];
			case "in_progress":
				return [m.client_timeline_in_progress()];
			case "reason":
				return [detail.reason];
		}
	}

	/** What a screen reader hears of where a step stands. */
	function stateLabel(state: StepState) {
		switch (state) {
			case "done":
				return m.client_timeline_done();
			case "current":
				return m.client_timeline_current();
			case "upcoming":
				return m.client_timeline_upcoming();
			case "ended":
				return null;
		}
	}
</script>

<Card.Root data-order-timeline>
	<Card.Header>
		<Card.Title>{m.client_timeline_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<ol class="flex flex-col">
			{#each steps as step, index (step.key)}
				{@const last = index === steps.length - 1}
				{@const said = stateLabel(step.state)}
				<li
					class="relative flex gap-3 pb-6 last:pb-0"
					data-step={step.key}
					data-state={step.state}
					aria-current={step.state === "current" ? "step" : undefined}
				>
					{#if !last}
						<!-- The line down to the next step: solid behind the order, dashed ahead of it. -->
						<span
							class={cn(
								"absolute top-7 bottom-1 left-3 -translate-x-1/2 border-l-2",
								step.state === "done" ? "border-primary" : "border-dashed border-border",
							)}
							aria-hidden="true"
						></span>
					{/if}
					<span
						class={cn(
							"relative flex size-6 shrink-0 items-center justify-center rounded-full border-2",
							step.state === "done" && "border-primary bg-primary text-primary-foreground",
							step.state === "current" && "border-primary bg-background text-primary",
							step.state === "upcoming" && "border-border bg-background",
							step.state === "ended" && "border-destructive/40 bg-destructive/10 text-destructive",
						)}
						aria-hidden="true"
					>
						{#if step.state === "done"}
							<CheckIcon class="size-3.5" />
						{:else if step.state === "ended"}
							<XIcon class="size-3.5" />
						{:else if step.state === "current"}
							<span class="size-2 rounded-full bg-primary"></span>
						{/if}
					</span>
					<div class="flex min-w-0 flex-col gap-0.5 pt-0.5">
						<p
							class={cn(
								"text-sm font-medium",
								step.state === "upcoming" && "text-muted-foreground",
								step.state === "ended" && "text-destructive",
							)}
						>
							{title(step.key)}
							{#if said}<span class="sr-only">({said})</span>{/if}
						</p>
						{#if step.at}
							<time
								datetime={step.at.toString()}
								class="text-xs text-muted-foreground tabular-nums"
							>
								{formatDateTime(step.at)}
							</time>
						{/if}
						{#each details(step.detail) as line, i (i)}
							<p class="text-sm whitespace-pre-line text-muted-foreground">{line}</p>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
