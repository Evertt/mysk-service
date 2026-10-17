import { describe, expect, test } from "vite-plus/test";

import {
	applyEvent,
	beaconOf,
	type DockEvent,
	dockFigures,
	dockState,
	doorAlertDue,
	doorBand,
	doorOpenFor,
	formatDuration,
	initialFacts,
	type SessionFacts,
} from "#modules/docks/model.ts";

/** A moment, `minutes` after 08:00 UTC on a fixed day: the specs' clock. */
const t = (minutes: number) => Temporal.Instant.from("2026-10-17T08:00:00Z").add({ minutes });

/** Applies `events` one after another to a new dock, keeping the sessions that ended. */
function run(events: DockEvent[]) {
	let facts = initialFacts();
	let session: SessionFacts | null = null;
	const ended: SessionFacts[] = [];
	for (const event of events) {
		const after = applyEvent(facts, session, event);
		facts = after.facts;
		session = after.session;
		if (after.ended) ended.push(after.ended);
	}
	return { facts, session, ended };
}

const truck = { carrier: "AMEX Transport", plate: "84-BNX-7", reference: "WB-20416" };

describe("applyEvent", () => {
	test("a session from check-in to check-out, with the door's open time added up", () => {
		const { facts, session, ended } = run([
			{ type: "check_in", at: t(0), payload: { ...truck, slot: { start: t(0), end: t(45) } } },
			{ type: "key_moved", at: t(1), payload: { to: "driver" } },
			{ type: "lock", at: t(3) },
			{ type: "door_open", at: t(5) },
			{ type: "door_close", at: t(20) },
			{ type: "door_open", at: t(22) },
			{ type: "door_close", at: t(30) },
			{ type: "unlock", at: t(31) },
			{ type: "check_out", at: t(33) },
		]);
		expect(session).toBeNull();
		expect(ended).toHaveLength(1);
		expect(ended[0]).toMatchObject({
			...truck,
			slotStart: t(0),
			slotEnd: t(45),
			checkedInAt: t(0),
			lockedAt: t(3),
			doorOpenedAt: t(5),
			doorClosedAt: t(30),
			unlockedAt: t(31),
			checkedOutAt: t(33),
			doorOpenSeconds: 23 * 60,
		});
		expect(facts).toMatchObject({
			locked: false,
			doorOpenSince: null,
			keyLocation: "driver",
			lastEventAt: t(33),
		});
	});

	test("a second check-in ends the session before it", () => {
		const { session, ended } = run([
			{ type: "check_in", at: t(0), payload: truck },
			{ type: "check_in", at: t(10), payload: { plate: "VX-218-K" } },
		]);
		expect(ended).toEqual([expect.objectContaining({ plate: "84-BNX-7", checkedOutAt: t(10) })]);
		expect(session).toMatchObject({ plate: "VX-218-K", carrier: null, checkedInAt: t(10) });
	});

	test("check-out releases the Wheel-Lok, and a door left open stays open", () => {
		const { facts, ended } = run([
			{ type: "check_in", at: t(0), payload: {} },
			{ type: "lock", at: t(1) },
			{ type: "door_open", at: t(2) },
			{ type: "check_out", at: t(12) },
		]);
		expect(facts.locked).toBe(false);
		expect(facts.doorOpenSince).toEqual(t(2));
		expect(ended[0].doorOpenSeconds).toBe(600);
	});

	test("a door that's open counts from the next truck's check-in for it", () => {
		const { session } = run([
			{ type: "door_open", at: t(0) },
			{ type: "check_in", at: t(30), payload: {} },
			{ type: "door_close", at: t(40) },
		]);
		expect(session).toMatchObject({ doorOpenedAt: t(30), doorOpenSeconds: 600 });
	});

	test("a second door_open keeps the first time, and resets no band", () => {
		const facts = { ...initialFacts(), doorOpenSince: t(0), doorAlert: "amber" as const };
		const after = applyEvent(facts, null, { type: "door_open", at: t(45) });
		expect(after.facts).toMatchObject({ doorOpenSince: t(0), doorAlert: "amber" });
	});

	test("closing the door clears the band the rules acted on", () => {
		const facts = { ...initialFacts(), doorOpenSince: t(0), doorAlert: "red" as const };
		const after = applyEvent(facts, null, { type: "door_close", at: t(70) });
		expect(after.facts).toMatchObject({ doorOpenSince: null, doorAlert: null });
	});

	test("an SCP fault and its recovery", () => {
		const faulty = run([{ type: "scp_fault", at: t(0), payload: { reason: "Sleutelfout" } }]);
		expect(faulty.facts).toMatchObject({ scpOnline: false, faultReason: "Sleutelfout" });
		const fine = applyEvent(faulty.facts, null, { type: "scp_ok", at: t(5) });
		expect(fine.facts).toMatchObject({ scpOnline: true, faultReason: null });
	});
});

describe("the state and the beacon", () => {
	test("follow the facts as in the mockup's sample", () => {
		const free = dockState({ scpOnline: true, locked: false }, false);
		const occupied = dockState({ scpOnline: true, locked: false }, true);
		const loading = dockState({ scpOnline: true, locked: true }, true);
		const fault = dockState({ scpOnline: false, locked: true }, true);
		expect([free, occupied, loading, fault]).toEqual(["free", "occupied", "loading", "fault"]);
		expect([free, occupied, loading, fault].map(beaconOf)).toEqual([
			"off",
			"orange",
			"green",
			"red",
		]);
	});
});

describe("the door rules' timing", () => {
	test("bands: under 40 minutes none, then amber, from 60 red", () => {
		expect(doorBand(0)).toBeNull();
		expect(doorBand(40 * 60 - 1)).toBeNull();
		expect(doorBand(40 * 60)).toBe("amber");
		expect(doorBand(60 * 60 - 1)).toBe("amber");
		expect(doorBand(60 * 60)).toBe("red");
	});

	test("a band is due once: amber at 40 minutes, red at 60, nothing after", () => {
		const open = { doorOpenSince: t(0), doorAlert: null };
		expect(doorAlertDue(open, t(39))).toBeNull();
		expect(doorAlertDue(open, t(40))).toBe("amber");
		expect(doorAlertDue({ ...open, doorAlert: "amber" }, t(59))).toBeNull();
		expect(doorAlertDue({ ...open, doorAlert: "amber" }, t(60))).toBe("red");
		expect(doorAlertDue({ ...open, doorAlert: "red" }, t(300))).toBeNull();
	});

	test("a door first seen after an hour goes straight to red", () => {
		expect(doorAlertDue({ doorOpenSince: t(0), doorAlert: null }, t(75))).toBe("red");
	});

	test("a closed door is due nothing", () => {
		expect(doorAlertDue({ doorOpenSince: null, doorAlert: null }, t(500))).toBeNull();
		expect(doorOpenFor(null, t(500))).toBe(0);
	});
});

describe("dockFigures", () => {
	test("count the board's tiles", () => {
		const figures = dockFigures(
			[
				{ state: "loading", locked: true, doorOpenSince: t(0) },
				{ state: "occupied", locked: false, doorOpenSince: null },
				{ state: "free", locked: false, doorOpenSince: null },
				{ state: "fault", locked: false, doorOpenSince: t(30) },
			],
			t(61),
		);
		expect(figures).toEqual({
			total: 4,
			occupied: 3,
			locked: 1,
			unlocked: 2,
			doorsOpen: 2,
			longestOpen: 61 * 60,
		});
	});

	test("formatDuration reads mm:ss below an hour, as the mockup's timers, else h:mm:ss", () => {
		expect(formatDuration(0)).toBe("00:00");
		expect(formatDuration(23 * 60 + 40)).toBe("23:40");
		expect(formatDuration(41 * 60 + 7)).toBe("41:07");
		expect(formatDuration(3600 + 27 * 60 + 20)).toBe("1:27:20");
		expect(formatDuration(3 * 3600 + 5)).toBe("3:00:05");
	});
});
