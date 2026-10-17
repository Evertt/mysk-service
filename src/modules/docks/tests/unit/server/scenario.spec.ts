import { describe, expect, test } from "vite-plus/test";

import { applyEvent, doorOpenFor, dockState } from "#modules/docks/model.ts";
import { mockupDocks } from "#modules/docks/server/demo.ts";
import { parseBatch } from "#modules/docks/server/events.ts";
import {
	dice,
	type FeedEvent,
	loadMinutes,
	type ScenarioDock,
	simulateDocks,
} from "#modules/docks/server/scenario.ts";

/** A moment, `minutes` after 08:00 UTC on a fixed day: the specs' clock. */
const t = (minutes: number) =>
	Temporal.Instant.from("2026-10-17T08:00:00Z").add({ seconds: Math.round(minutes * 60) });

/** The four demo docks as the mockup has them at `t(0)`. */
const mockup = (): ScenarioDock[] =>
	Object.entries(mockupDocks(t(0))).map(([code, dock]) => ({ code, ...dock }));

/** Applies feed events to the docks as the feed would (validated, in time order). */
function apply(docks: ScenarioDock[], events: FeedEvent[], now: Temporal.Instant) {
	const parsed = parseBatch({ events }, now);
	if ("issues" in parsed) throw new Error(JSON.stringify(parsed.issues));
	return docks.map((dock) => {
		let { facts, session } = dock;
		for (const event of parsed.events.filter((each) => each.dock === dock.code)) {
			const after = applyEvent(facts, session, event);
			({ facts, session } = after);
		}
		return { ...dock, facts, session };
	});
}

/**
 * Runs the scenario from the mockup's states for `minutes`, one tick a minute (or of `every`),
 * and answers every event and each minute's docks.
 */
function run(minutes: number, { speed = 1, every = 1 } = {}) {
	let docks = mockup();
	const events: FeedEvent[] = [];
	const seen: { at: Temporal.Instant; docks: ScenarioDock[] }[] = [];
	for (let at = every; at <= minutes; at += every) {
		const ticked = simulateDocks(docks, { from: t(at - every), to: t(at), speed, startedAt: t(0) });
		for (const event of ticked) {
			const time = Temporal.Instant.from(event.at);
			expect(Temporal.Instant.compare(time, t(at - every))).toBeGreaterThanOrEqual(0);
			expect(Temporal.Instant.compare(time, t(at))).toBeLessThanOrEqual(0);
		}
		docks = apply(docks, ticked, t(at));
		events.push(...ticked);
		seen.push({ at: t(at), docks });
	}
	return { events, seen, docks };
}

const count = (events: FeedEvent[], type: string, dock?: string) =>
	events.filter((each) => each.type === type && (!dock || each.dock === dock)).length;

describe("the dice", () => {
	test("give the same number for the same text, in [0, 1)", () => {
		expect(dice("DOCK 05|1")).toBe(dice("DOCK 05|1"));
		expect(dice("DOCK 05|1")).not.toBe(dice("DOCK 05|2"));
		for (let i = 0; i < 200; i++) {
			expect(dice(`x${i}`)).toBeGreaterThanOrEqual(0);
			expect(dice(`x${i}`)).toBeLessThan(1);
		}
	});

	test("make most loads short, some 40 minutes or more and a few an hour or more", () => {
		const loads = Array.from({ length: 500 }, (_, i) => loadMinutes(`dock|${i}`));
		const amber = loads.filter((each) => each >= 40 && each < 60).length;
		const red = loads.filter((each) => each >= 60).length;
		expect(loads.filter((each) => each < 40).length).toBeGreaterThan(250);
		expect(amber).toBeGreaterThan(80);
		expect(red).toBeGreaterThan(20);
		expect(red).toBeLessThan(100);
	});
});

describe("simulateDocks", () => {
	test("plans the same events from the same facts", () => {
		const interval = { from: t(0), to: t(30), speed: 1, startedAt: t(0) };
		expect(simulateDocks(mockup(), interval)).toEqual(simulateDocks(mockup(), interval));
	});

	test("ticks of a minute and one tick of the whole interval make the same events", () => {
		const minutes = run(45).events;
		const once = run(45, { every: 45 }).events;
		expect(once.map(({ type, dock, at }) => [type, dock, at])).toEqual(
			minutes.map(({ type, dock, at }) => [type, dock, at]),
		);
	});

	test("keeps the mockup's states for the first minute after a start, at 1×", () => {
		expect(simulateDocks(mockup(), { from: t(0), to: t(1), speed: 1, startedAt: t(0) })).toEqual(
			[],
		);
	});

	test("moves each mockup dock on within minutes of a reset", () => {
		const { events } = run(15);
		// DOCK 07 (free): a truck checks in; DOCK 06 (open, unlocked): the driver locks at last;
		// DOCK 08 (key fault): the SCP recovers; DOCK 05 (loading): its door closes.
		expect(count(events, "check_in", "DOCK 07")).toBe(1);
		expect(count(events, "lock", "DOCK 06")).toBe(1);
		expect(count(events, "scp_ok", "DOCK 08")).toBe(1);
		expect(count(events, "door_close", "DOCK 05")).toBe(1);
	});

	test("goes round the cycle: trucks come and go, and every door opened is closed again", () => {
		const { events, seen, docks } = run(8 * 60);
		const start = mockup();
		for (const code of ["DOCK 05", "DOCK 06", "DOCK 07", "DOCK 08"]) {
			expect(count(events, "check_in", code)).toBeGreaterThan(3);
			expect(count(events, "check_out", code)).toBeGreaterThan(3);
			// Each door opened is closed again: open at the end only if it was opened last.
			const wasOpen = start.find((dock) => dock.code === code)!.facts.doorOpenSince ? 1 : 0;
			const isOpen = docks.find((dock) => dock.code === code)!.facts.doorOpenSince ? 1 : 0;
			const opened = count(events, "door_open", code);
			expect(wasOpen + opened - count(events, "door_close", code)).toBe(isOpen);
		}
		// Every state shows now and then, and some door stays open past 40 and past 60 minutes.
		const states = new Set(
			seen.flatMap(({ docks }) =>
				docks.map((dock) => dockState(dock.facts, dock.session !== null)),
			),
		);
		expect([...states].toSorted()).toEqual(["fault", "free", "loading", "occupied"]);
		const longest = (minutes: number) =>
			seen.some(({ at, docks }) =>
				docks.some((dock) => doorOpenFor(dock.facts.doorOpenSince, at) >= minutes * 60),
			);
		expect(longest(40)).toBe(true);
		expect(longest(60)).toBe(true);
		expect(count(events, "door_open")).toBeGreaterThan(10);
	});

	test("a key fault clears after a few minutes", () => {
		const { seen } = run(8 * 60);
		for (const code of ["DOCK 05", "DOCK 06", "DOCK 07", "DOCK 08"]) {
			let faulty = 0;
			for (const { docks } of seen) {
				const dock = docks.find((each) => each.code === code)!;
				faulty = dock.facts.scpOnline ? 0 : faulty + 1;
				expect(faulty).toBeLessThanOrEqual(9);
			}
		}
	});

	test("is busier at a higher speed", () => {
		const slow = run(60).events;
		const fast = run(60, { speed: 10 }).events;
		expect(count(fast, "check_in")).toBeGreaterThan(count(slow, "check_in") * 4);
	});

	test("what was due while paused happens from the interval's start on", () => {
		const docks = mockup();
		// Ticked first two hours after the mockup's states: DOCK 07's check-in was due long before.
		const events = simulateDocks(docks, { from: t(120), to: t(121), speed: 1, startedAt: t(0) });
		const checkIn = events.find((each) => each.type === "check_in" && each.dock === "DOCK 07");
		expect(checkIn?.at).toBe(t(120).toString());
	});
});
