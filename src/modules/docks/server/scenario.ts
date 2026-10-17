import type { SimulationTick } from "#lib/simulation/extensions.ts";

/**
 * The demo's dock scenario, pure: what the Salvo hardware would report at the demo's docks over an
 * interval of real time (`simulateDocks()`), as the feed's events, worked out from each dock's
 * facts and open session as stored. Trucks check in, lock, open the door, load, close it, unlock
 * and check out; now and then a load takes 40 minutes or more (amber), and sometimes an hour or
 * more (red: the rules make a breakdown order, one per door at most); now and then a free dock's
 * SCP reports a key fault, which clears after a few minutes. Every door it opens it closes again.
 *
 * Stateless: each step's time follows from the facts (the last event's time, when the door
 * opened, when the truck checked in) and dice thrown on them, so a tick knows nothing of the one
 * before, and two that read the same facts plan the same events. `speed` divides every duration:
 * at 30× a load of 30 minutes takes one.
 */
import {
	applyEvent,
	type DockEvent,
	type DockEventType,
	type DockFacts,
	type KeyLocation,
	type SessionFacts,
} from "../model.ts";
import { slotOf } from "./demo.ts";

/** A dock the scenario drives: its code, and its facts and open session as stored. */
export interface ScenarioDock {
	code: string;
	facts: DockFacts;
	session: SessionFacts | null;
}

/** An event as the feed posts it (`docs/salvo-events.md`). */
export interface FeedEvent {
	id: string;
	type: DockEventType;
	dock: string;
	at: string;
	payload?: Record<string, unknown>;
}

/** A number in [0, 1) from `text`, the same for the same text: the scenario's dice (FNV-1a). */
export function dice(text: string) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash / 2 ** 32;
}

const between = (text: string, min: number, max: number) => min + dice(text) * (max - min);

/**
 * How long a truck's door stays open for its load, in real minutes at `speed`: mostly 15–35
 * (divided by the speed, like every other step), now and then 42–55 (the door turns amber) and
 * sometimes 61–68 (red, and a breakdown order). The long ones aren't sped up: the door rules count
 * real time, and they're what the demo shows. They're rarer at a higher speed instead, so they
 * come about as often per hour while the trucks come and go faster.
 */
export function loadMinutes(key: string, speed = 1) {
	const roll = dice(`${key}|band`) * speed;
	if (roll < 0.1) return between(`${key}|load`, 61, 68);
	if (roll < 0.4) return between(`${key}|load`, 42, 55);
	return between(`${key}|load`, 15, 35) / speed;
}

/** The share of a free dock's quiet spells that end in an SCP key fault rather than a truck. */
const faultShare = 0.15;

const carriers = [
	"AMEX Transport",
	"Van der Wal Logistiek",
	"Bakker Transport",
	"De Rijke",
	"Mooy Logistics",
	"Wim Bosman",
];

/** A Dutch plate from the dice, e.g. `84-BNX-7`. */
function plate(key: string) {
	const letter = (i: number) => String.fromCharCode(65 + Math.floor(dice(`${key}|l${i}`) * 26));
	const digits = 10 + Math.floor(dice(`${key}|d`) * 90);
	return `${digits}-${letter(0)}${letter(1)}${letter(2)}-${1 + Math.floor(dice(`${key}|n`) * 9)}`;
}

/** What a step reports: events of these types (with their payloads), all at the step's time. */
type StepEvent =
	| { type: "check_in"; truck: string }
	| { type: "key_moved"; to: KeyLocation }
	| { type: "scp_fault" }
	| { type: Exclude<DockEventType, "check_in" | "key_moved" | "scp_fault"> };

/** A dock's next step: when it's due, and what it reports. */
interface Step {
	due: Temporal.Instant;
	events: StepEvent[];
}

const later = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) >= 0 ? a : b;

/**
 * The dock's next step after its facts, at `speed`. Its steps count from its last event, or from
 * `startedAt` (the simulation's start) if that's later: the starting states (the mockup's, with
 * events from long ago) stay a while after a reset before they move on.
 */
export function nextStep(dock: ScenarioDock, speed: number, startedAt: Temporal.Instant): Step {
	const { facts, session, code } = dock;
	const since = later(facts.lastEventAt ?? startedAt, startedAt);
	const after = (anchor: Temporal.Instant, minutes: number) =>
		anchor.add({ milliseconds: Math.round((minutes * 60_000) / speed) });
	const afterReal = (anchor: Temporal.Instant, minutes: number) =>
		anchor.add({ milliseconds: Math.round(minutes * 60_000) });
	const key = `${code}|${since.epochMilliseconds}`;

	if (!facts.scpOnline) {
		return { due: after(since, between(`${key}|fault`, 4, 8)), events: [{ type: "scp_ok" }] };
	}
	if (!session) {
		if (facts.doorOpenSince) return { due: after(since, 1), events: [{ type: "door_close" }] };
		if (facts.locked) return { due: after(since, 1), events: [{ type: "unlock" }] };
		if (dice(`${key}|faulty`) < faultShare) {
			return { due: after(since, between(`${key}|quiet`, 2, 6)), events: [{ type: "scp_fault" }] };
		}
		return {
			due: after(since, between(`${key}|idle`, 3, 12)),
			events: [
				{ type: "check_in", truck: key },
				{ type: "key_moved", to: "driver" },
			],
		};
	}

	const visit = `${code}|${session.checkedInAt.epochMilliseconds}`;
	const lock: StepEvent[] = [{ type: "key_moved", to: "scp" }, { type: "lock" }];
	if (!facts.locked && !session.lockedAt) {
		// A door open at an unlocked truck (as DOCK 06 in the mockup): the driver locks at last.
		if (facts.doorOpenSince) {
			return { due: later(after(facts.doorOpenSince, 48), after(since, 2)), events: lock };
		}
		return { due: after(since, between(`${visit}|lock`, 1.5, 4)), events: lock };
	}
	if (facts.doorOpenSince) {
		if (!facts.locked) return { due: after(since, 1), events: [{ type: "door_close" }] };
		return {
			due: later(
				afterReal(facts.doorOpenSince, loadMinutes(visit, speed)),
				after(since, between(`${visit}|rest`, 3, 8)),
			),
			events: [{ type: "door_close" }],
		};
	}
	if (facts.locked && !session.doorOpenedAt) {
		return { due: after(since, between(`${visit}|open`, 0.5, 2)), events: [{ type: "door_open" }] };
	}
	if (facts.locked) {
		return {
			due: after(since, 1),
			events: [{ type: "unlock" }, { type: "key_moved", to: "driver" }],
		};
	}
	return {
		due: after(since, between(`${visit}|leave`, 0.5, 2)),
		events: [{ type: "check_out" }, { type: "key_moved", to: "storage" }],
	};
}

/** The moment rounded up to a whole second, as the database keeps moments. */
const wholeSecond = (at: Temporal.Instant) =>
	Temporal.Instant.fromEpochMilliseconds(Math.ceil(at.epochMilliseconds / 1000) * 1000);

/** A step's event as the model takes it, at `at`. */
function dockEvent(event: StepEvent, at: Temporal.Instant): DockEvent {
	switch (event.type) {
		case "check_in":
			return {
				type: "check_in",
				at,
				payload: {
					carrier: carriers[Math.floor(dice(`${event.truck}|carrier`) * carriers.length)],
					plate: plate(event.truck),
					reference: `WB-${20_420 + Math.floor(dice(`${event.truck}|ref`) * 580)}`,
					slot: slotOf(at),
				},
			};
		case "key_moved":
			return { type: "key_moved", at, payload: { to: event.to } };
		case "scp_fault":
			return { type: "scp_fault", at, payload: { reason: "Sleutelfout" } };
		default:
			return { type: event.type, at };
	}
}

/** An event as the feed posts it: times as ISO strings. */
function feedEvent(code: string, event: DockEvent, index: number): FeedEvent {
	const payload =
		event.type === "check_in"
			? {
					...event.payload,
					slot: event.payload.slot && {
						start: event.payload.slot.start.toString(),
						end: event.payload.slot.end.toString(),
					},
				}
			: event.payload;
	return {
		id: `sim-${code.replaceAll(" ", "")}-${event.at.epochMilliseconds}-${index}`,
		type: event.type,
		dock: code,
		at: event.at.toString(),
		...(payload && Object.keys(payload).length ? { payload } : {}),
	};
}

/** At most this many steps per dock in one interval (30× over the 10-minute cap is ~10). */
const maxSteps = 200;

/**
 * The events the docks report over `(from, to]` at `speed`, in time order. A step that was due
 * before `from` (the simulation was paused, or no one ticked it) happens from `from` on: the
 * paused time isn't made up for.
 */
export function simulateDocks(
	docks: ScenarioDock[],
	{ from, to, speed, startedAt }: Pick<SimulationTick, "from" | "to" | "speed" | "startedAt">,
): FeedEvent[] {
	const events: FeedEvent[] = [];
	for (const dock of docks) {
		let state = { ...dock };
		for (let i = 0; i < maxSteps; i++) {
			const step = nextStep(state, speed, startedAt);
			const at = wholeSecond(later(step.due, from));
			if (Temporal.Instant.compare(at, to) > 0) break;
			step.events.forEach((each, index) => {
				const event = dockEvent(each, at);
				const changed = applyEvent(state.facts, state.session, event);
				state = { ...state, facts: changed.facts, session: changed.session };
				events.push(feedEvent(dock.code, event, index));
			});
		}
	}
	return events.toSorted((a, b) => a.at.localeCompare(b.at));
}
