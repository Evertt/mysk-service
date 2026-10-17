import { describe, expect, test } from "vite-plus/test";

import { maxBatch, parseBatch } from "#modules/docks/server/events.ts";

const now = Temporal.Instant.from("2026-10-17T08:00:00Z");
const event = (fields: Record<string, unknown> = {}) => ({
	id: "e-1",
	type: "lock",
	dock: "DOCK 05",
	at: "2026-10-17T07:59:00Z",
	...fields,
});

const issuesOf = (body: unknown) => {
	const parsed = parseBatch(body, now);
	return "issues" in parsed ? parsed.issues : [];
};

describe("parseBatch", () => {
	test("takes each type with its payload, times with an offset", () => {
		const parsed = parseBatch(
			{
				events: [
					event({
						id: "a",
						type: "check_in",
						at: "2026-10-17T09:30:00+02:00",
						payload: {
							carrier: " AMEX Transport ",
							plate: "84-BNX-7",
							slot: { start: "2026-10-17T07:30:00Z", end: "2026-10-17T08:15:00Z" },
						},
					}),
					event({ id: "b", type: "key_moved", payload: { to: "driver" } }),
					event({ id: "c", type: "scp_fault", payload: { reason: "Sleutelfout" } }),
					event({ id: "d", type: "scp_fault" }),
					event({ id: "e", type: "door_open", payload: {} }),
				],
			},
			now,
		);
		expect("events" in parsed).toBe(true);
		if (!("events" in parsed)) return;
		const checkIn = parsed.events.find((each) => each.id === "a")!;
		expect(checkIn.at).toEqual(Temporal.Instant.from("2026-10-17T07:30:00Z"));
		expect(checkIn).toMatchObject({ type: "check_in", payload: { carrier: "AMEX Transport" } });
		expect(parsed.events.find((each) => each.id === "d")!.payload).toEqual({});
	});

	test("orders the events by time, then as sent", () => {
		const parsed = parseBatch(
			{
				events: [
					event({ id: "late", at: "2026-10-17T07:59:00Z" }),
					event({ id: "early", at: "2026-10-17T07:00:00Z" }),
					event({ id: "late-too", at: "2026-10-17T07:59:00Z" }),
				],
			},
			now,
		);
		expect("events" in parsed && parsed.events.map((each) => each.id)).toEqual([
			"early",
			"late",
			"late-too",
		]);
	});

	test("refuses anything that isn't exactly the format", () => {
		expect(issuesOf({})).not.toEqual([]);
		expect(issuesOf({ events: [], extra: 1 })).not.toEqual([]);
		expect(issuesOf({ events: [event({ type: "explode" })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ colour: "red" })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ payload: { to: "scp" } })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ type: "key_moved" })] })).not.toEqual([]);
		expect(
			issuesOf({ events: [event({ type: "key_moved", payload: { to: "pocket" } })] }),
		).not.toEqual([]);
		expect(issuesOf({ events: [event({ at: "2026-10-17 07:59" })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ at: "yesterday" })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ id: "" })] })).not.toEqual([]);
		expect(issuesOf({ events: [event({ dock: "" })] })).not.toEqual([]);
		expect(
			issuesOf({
				events: [
					event({
						type: "check_in",
						payload: { slot: { start: "2026-10-17T09:00:00Z", end: "2026-10-17T08:00:00Z" } },
					}),
				],
			}),
		).not.toEqual([]);
	});

	test("names the path of what's wrong", () => {
		expect(issuesOf({ events: [event(), event({ at: "nonsense" })] })).toEqual([
			expect.objectContaining({ path: "events.1.at" }),
		]);
	});

	test("refuses an event more than five minutes ahead of the server", () => {
		expect(issuesOf({ events: [event({ at: "2026-10-17T08:04:59Z" })] })).toEqual([]);
		expect(issuesOf({ events: [event({ at: "2026-10-17T08:05:01Z" })] })).toEqual([
			{ path: "events.0.at", message: "The event is in the future" },
		]);
	});

	test(`takes at most ${maxBatch} events`, () => {
		const events = (count: number) =>
			Array.from({ length: count }, (_, i) => event({ id: `e-${i}` }));
		expect(issuesOf({ events: events(maxBatch) })).toEqual([]);
		expect(issuesOf({ events: events(maxBatch + 1) })).not.toEqual([]);
	});
});
