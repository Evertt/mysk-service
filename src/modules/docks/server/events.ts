/**
 * The Salvo event feed's payload, validated strictly (see `docs/salvo-events.md`): a batch of at
 * most `maxBatch` events, each with its id, type, dock code, time (ISO 8601 with an offset) and
 * the payload its type takes; nothing else. `parseBatch()` answers the events or the issues, by
 * path, for the endpoint's 422. The feed is for machines, so its issues are in English.
 */
// Its module-scope durations need Temporal as the module loads, which SvelteKit's build does (analysing
// the routes) without the hooks that install the polyfill, and Node before 26 has none of its own.
import "temporal-polyfill/global";
import * as v from "valibot";

import { dockCodePattern, type DockEvent, keyLocations } from "../model.ts";

/** At most this many events per batch: one transaction holds the database, keep it short. */
export const maxBatch = 100;

/** How far ahead of the server's clock an event may be (the hardware's clock may run ahead). */
const allowedSkew = Temporal.Duration.from({ minutes: 5 });

const instant = v.pipe(
	v.string(),
	v.maxLength(40),
	v.check((value) => {
		try {
			Temporal.Instant.from(value);
			return true;
		} catch {
			return false;
		}
	}, "Expected an ISO 8601 time with an offset, e.g. 2026-10-17T08:15:00Z"),
	v.transform((value) => Temporal.Instant.from(value)),
);

const shortText = (max: number) => v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(max));

const base = {
	id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
	dock: v.pipe(v.string(), v.regex(dockCodePattern, "Expected a dock code, e.g. DOCK 05")),
	at: instant,
};

const empty = v.optional(v.strictObject({}));

const eventSchema = v.variant("type", [
	v.strictObject({
		...base,
		type: v.literal("check_in"),
		payload: v.optional(
			v.strictObject({
				carrier: v.optional(shortText(100)),
				plate: v.optional(shortText(20)),
				reference: v.optional(shortText(50)),
				slot: v.optional(
					v.pipe(
						v.strictObject({ start: instant, end: instant }),
						v.check(
							({ start, end }) => Temporal.Instant.compare(start, end) <= 0,
							"The slot ends before it starts",
						),
					),
				),
			}),
			{},
		),
	}),
	v.strictObject({
		...base,
		type: v.literal("key_moved"),
		payload: v.strictObject({ to: v.picklist(keyLocations) }),
	}),
	v.strictObject({
		...base,
		type: v.literal("scp_fault"),
		payload: v.optional(v.strictObject({ reason: v.optional(shortText(200)) }), {}),
	}),
	v.strictObject({
		...base,
		type: v.picklist(["lock", "unlock", "door_open", "door_close", "scp_ok", "check_out"]),
		payload: empty,
	}),
]);

const batchSchema = v.strictObject({
	events: v.pipe(
		v.array(eventSchema),
		v.maxLength(maxBatch, `At most ${maxBatch} events per batch`),
	),
});

/** An event as it came in, validated: its id and dock code, and the event itself. */
export type IncomingEvent = DockEvent & { id: string; dock: string; index: number };

/** A problem with the batch, at a path like `events.3.at`. */
interface BatchIssue {
	path: string;
	message: string;
}

/**
 * The batch's events, validated, in the order to apply them: by time, and in the order they came
 * for the same time. Refuses the lot if any is wrong, or more than `allowedSkew` ahead of `now`.
 */
export function parseBatch(
	body: unknown,
	now: Temporal.Instant,
): { events: IncomingEvent[] } | { issues: BatchIssue[] } {
	const result = v.safeParse(batchSchema, body);
	if (!result.success) {
		return {
			issues: result.issues.map((issue) => ({
				path: v.getDotPath(issue) ?? "",
				message: issue.message,
			})),
		};
	}
	const latest = now.add(allowedSkew);
	const issues: BatchIssue[] = [];
	const events = result.output.events.map((event, index) => {
		if (Temporal.Instant.compare(event.at, latest) > 0) {
			issues.push({ path: `events.${index}.at`, message: "The event is in the future" });
		}
		return { ...event, index } as IncomingEvent;
	});
	if (issues.length) return { issues };
	return {
		events: events.toSorted((a, b) => Temporal.Instant.compare(a.at, b.at) || a.index - b.index),
	};
}
