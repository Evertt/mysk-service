import { describe, expect, test } from "vite-plus/test";

import type { OrderStatus } from "#lib/models.ts";
import {
	type TimelineOrder,
	timelineSteps,
} from "#routes/(customer)/portal/orders/[number]/timeline.ts";

const reported = Temporal.Instant.from("2026-11-02T08:00:00Z");
const decided = Temporal.Instant.from("2026-11-02T10:00:00Z");
const planned = Temporal.Instant.from("2026-11-04T09:00:00Z");
const departed = Temporal.Instant.from("2026-11-04T08:30:00Z");
const completed = Temporal.Instant.from("2026-11-04T11:00:00Z");

const order = (status: OrderStatus, extra: Partial<TimelineOrder> = {}): TimelineOrder => ({
	status,
	createdAt: reported,
	scheduledFor: planned,
	completedAt: null,
	decidedAt: decided,
	rejectionReason: null,
	engineer: "Lev",
	departedAt: null,
	...extra,
});

/** Each step as `key:state`. */
const states = (of: TimelineOrder) => timelineSteps(of).map((step) => `${step.key}:${step.state}`);

describe("the timeline's steps", () => {
	test("follow the order from received to resolved", () => {
		expect(states(order("awaiting_acceptance", { scheduledFor: null, decidedAt: null }))).toEqual([
			"received:done",
			"scheduled:upcoming",
			"on_the_way:upcoming",
			"resolved:upcoming",
		]);
		expect(states(order("quote", { scheduledFor: null }))).toEqual([
			"received:done",
			"scheduled:current",
			"on_the_way:upcoming",
			"resolved:upcoming",
		]);
		expect(states(order("scheduled"))).toEqual([
			"received:done",
			"scheduled:done",
			"on_the_way:upcoming",
			"resolved:upcoming",
		]);
		expect(states(order("on_the_way", { departedAt: departed }))).toEqual([
			"received:done",
			"scheduled:done",
			"on_the_way:current",
			"resolved:upcoming",
		]);
		expect(states(order("in_progress", { departedAt: departed }))).toEqual([
			"received:done",
			"scheduled:done",
			"on_the_way:done",
			"resolved:current",
		]);
		for (const status of ["completed", "invoiced"] as const) {
			expect(states(order(status, { completedAt: completed }))).toEqual([
				"received:done",
				"scheduled:done",
				"on_the_way:done",
				"resolved:done",
			]);
		}
	});

	test("say when each happened, where it's known", () => {
		const steps = timelineSteps(
			order("completed", { departedAt: departed, completedAt: completed }),
		);
		expect(steps.map((step) => step.at)).toEqual([reported, null, departed, completed]);
		expect(steps[1].detail).toEqual({ kind: "planned", at: planned, engineer: "Lev" });
		// Started without saying they were on the way: done, without a time.
		expect(timelineSteps(order("in_progress"))[2]).toMatchObject({ state: "done", at: null });
	});

	test("say what's awaited: acceptance, then the planning", () => {
		expect(timelineSteps(order("awaiting_acceptance"))[0].detail).toEqual({ kind: "awaiting" });
		expect(timelineSteps(order("quote"))[1].detail).toEqual({ kind: "accepted", at: decided });
		expect(timelineSteps(order("in_progress"))[3].detail).toEqual({ kind: "in_progress" });
	});

	test("end after received when the report is rejected, with the reason, or the order cancelled", () => {
		const rejected = timelineSteps(order("cancelled", { rejectionReason: "Niet ons onderhoud" }));
		expect(rejected.map((step) => `${step.key}:${step.state}`)).toEqual([
			"received:done",
			"rejected:ended",
		]);
		expect(rejected[1]).toMatchObject({
			at: decided,
			detail: { kind: "reason", reason: "Niet ons onderhoud" },
		});
		expect(states(order("cancelled"))).toEqual(["received:done", "cancelled:ended"]);
	});
});
