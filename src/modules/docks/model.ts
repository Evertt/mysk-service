/**
 * Salvo Dock Time Management (`docs/plans/shltr-domain.md`, §2.4, §3.4): a site's dock positions,
 * each dock's live state as the Salvo hardware reports it, and the sessions of the trucks at it
 * (check-in → locked → door open → door closed → check-out). Pure rules, shared by the server, the
 * board and the tests: how an event changes a dock (`applyEvent()`), what state and beacon follow
 * from the facts (`dockState()`, `beaconOf()`), the door-open bands (`doorBand()`) and the board's
 * figures (`dockFigures()`). The event feed itself is described in `docs/salvo-events.md`.
 */
import { later } from "#lib/dates.ts";

/**
 * What the Salvo integration reports, see `docs/salvo-events.md`.
 * @labels dockEvent
 */
export const dockEventTypes = [
	"check_in",
	"lock",
	"unlock",
	"door_open",
	"door_close",
	"key_moved",
	"scp_fault",
	"scp_ok",
	"check_out",
] as const;
export type DockEventType = (typeof dockEventTypes)[number];

/**
 * Vrij, Bezet, Laden, Storing: derived from the facts (`dockState()`).
 * @labels dockState
 */
const dockStates = ["free", "occupied", "loading", "fault"] as const;
export type DockState = (typeof dockStates)[number];

/**
 * Where the dock's Salvo key is: in its SCP, with the driver, or in the key storage unit.
 * @labels keyLocation
 */
export const keyLocations = ["scp", "driver", "storage"] as const;
export type KeyLocation = (typeof keyLocations)[number];

/**
 * The beacon outside the dock: rood, oranje, groen, uit.
 * @labels beacon
 */
const beacons = ["green", "orange", "red", "off"] as const;
export type Beacon = (typeof beacons)[number];

/** How long a door has been open, by band: < 40 min nothing, 40–60 amber, ≥ 60 red. */
export const doorBands = ["amber", "red"] as const;
export type DoorBand = (typeof doorBands)[number];

/** From this many minutes open, the door is amber and the dock planner gets a notice. */
const amberMinutes = 40;
/** From this many minutes open, the door is red and a breakdown order is made for it. */
const redMinutes = 60;

/** What an event outcome is: applied, already received (by its id), or older than the dock's state. */
export const eventOutcomes = ["applied", "duplicate", "stale"] as const;
export type EventOutcome = (typeof eventOutcomes)[number];

/** A dock's live facts, as the events leave them (a row of `dock_state`). */
export interface DockFacts {
	/** The Wheel-Lok is on. */
	locked: boolean;
	/** Since when the door is open; none while it's closed. */
	doorOpenSince: Temporal.Instant | null;
	/** The SCP (Salvo Control Panel) works; false after a fault until it reports it's fine. */
	scpOnline: boolean;
	/** What the SCP said about its fault, e.g. "Sleutelfout". */
	faultReason: string | null;
	keyLocation: KeyLocation;
	/** The band of the open door the rules have acted on, so they act once per band. */
	doorAlert: DoorBand | null;
	/** The time of the last event applied: an older one is stale. */
	lastEventAt: Temporal.Instant | null;
}

/** A truck's visit to a dock, as the events make it (a row of `dock_session`). */
export interface SessionFacts {
	/** Its row's id; none until it's stored. */
	id?: number;
	carrier: string | null;
	plate: string | null;
	/** The load's reference, e.g. a work order `WB-20416`. */
	reference: string | null;
	slotStart: Temporal.Instant | null;
	slotEnd: Temporal.Instant | null;
	checkedInAt: Temporal.Instant;
	/** The first lock. */
	lockedAt: Temporal.Instant | null;
	/** When the door first opened. */
	doorOpenedAt: Temporal.Instant | null;
	/** When the door last closed. */
	doorClosedAt: Temporal.Instant | null;
	/** The last unlock. */
	unlockedAt: Temporal.Instant | null;
	checkedOutAt: Temporal.Instant | null;
	/** How long the door was open in all, in seconds, up to its last close. */
	doorOpenSeconds: number;
}

/** An event, validated (see `server/events.ts`). */
export type DockEvent =
	| {
			type: "check_in";
			at: Temporal.Instant;
			payload: {
				carrier?: string;
				plate?: string;
				reference?: string;
				slot?: { start: Temporal.Instant; end: Temporal.Instant };
			};
	  }
	| { type: "key_moved"; at: Temporal.Instant; payload: { to: KeyLocation } }
	| { type: "scp_fault"; at: Temporal.Instant; payload: { reason?: string } }
	| {
			type: Exclude<DockEventType, "check_in" | "key_moved" | "scp_fault">;
			at: Temporal.Instant;
			payload?: Record<string, never>;
	  };

/** A dock that has never reported: free, unlocked, its key in the SCP. */
export const initialFacts = (): DockFacts => ({
	locked: false,
	doorOpenSince: null,
	scpOnline: true,
	faultReason: null,
	keyLocation: "scp",
	doorAlert: null,
	lastEventAt: null,
});

/** A dock as an event leaves it: its facts, its open session, and the session it ended, if any. */
interface DockAfter {
	facts: DockFacts;
	session: SessionFacts | null;
	/** The session the event ended: checked out, or replaced by a new check-in. */
	ended: SessionFacts | null;
}

const seconds = (from: Temporal.Instant, to: Temporal.Instant) =>
	Math.max(0, Math.round(from.until(to).total("seconds")));

/**
 * The session with its door closed at `at`: the open time added up, from when the door opened or
 * the truck checked in, whichever is later (a door left open counts for the truck from its arrival).
 */
function closeDoor(session: SessionFacts | null, since: Temporal.Instant, at: Temporal.Instant) {
	if (!session) return null;
	const from = later(since, session.checkedInAt);
	return {
		...session,
		doorClosedAt: at,
		doorOpenSeconds: session.doorOpenSeconds + seconds(from, at),
	};
}

/**
 * What `event` does to a dock with `facts` and its open `session`. Salvo's word is taken as it
 * comes: a lock without a check-in still locks, a second check-in ends the session before it.
 * Pure: the caller stores the result.
 */
export function applyEvent(
	facts: DockFacts,
	session: SessionFacts | null,
	event: DockEvent,
): DockAfter {
	const { at } = event;
	const next: DockFacts = { ...facts, lastEventAt: at };
	let ended: SessionFacts | null = null;
	let open = session ? { ...session } : null;

	switch (event.type) {
		case "check_in": {
			if (open) {
				ended = { ...open, checkedOutAt: at };
				if (next.doorOpenSince) ended = closeDoor(ended, next.doorOpenSince, at);
			}
			const { carrier, plate, reference, slot } = event.payload;
			open = {
				carrier: carrier ?? null,
				plate: plate ?? null,
				reference: reference ?? null,
				slotStart: slot?.start ?? null,
				slotEnd: slot?.end ?? null,
				checkedInAt: at,
				lockedAt: null,
				doorOpenedAt: null,
				doorClosedAt: null,
				unlockedAt: null,
				checkedOutAt: null,
				doorOpenSeconds: 0,
			};
			// The door is still open (it wasn't reported closed): it stays open, and counts for the new
			// truck from now (see `closeDoor()`).
			if (next.doorOpenSince) open.doorOpenedAt = at;
			next.locked = false;
			break;
		}
		case "lock":
			next.locked = true;
			if (open && !open.lockedAt) open.lockedAt = at;
			break;
		case "unlock":
			next.locked = false;
			if (open) open.unlockedAt = at;
			break;
		case "door_open":
			if (!next.doorOpenSince) {
				next.doorOpenSince = at;
				next.doorAlert = null;
				if (open && !open.doorOpenedAt) open.doorOpenedAt = at;
			}
			break;
		case "door_close":
			if (next.doorOpenSince) {
				open = closeDoor(open, next.doorOpenSince, at);
				next.doorOpenSince = null;
				next.doorAlert = null;
			}
			break;
		case "key_moved":
			next.keyLocation = event.payload.to;
			break;
		case "scp_fault":
			next.scpOnline = false;
			next.faultReason = event.payload.reason ?? null;
			break;
		case "scp_ok":
			next.scpOnline = true;
			next.faultReason = null;
			break;
		case "check_out":
			// Check-out releases the Wheel-Lok; a door that's still open stays open (and counted).
			next.locked = false;
			if (open) {
				ended = { ...open, checkedOutAt: at };
				if (next.doorOpenSince) ended = closeDoor(ended, next.doorOpenSince, at);
				open = null;
			}
			break;
		default: {
			const never: never = event;
			throw new Error(`Unknown dock event ${JSON.stringify(never)}`);
		}
	}
	return { facts: next, session: open, ended };
}

/**
 * The dock's state from its facts: Storing while its SCP is faulty, Laden while it's locked (it's
 * safe to load), Bezet while a truck is checked in but not locked, else Vrij.
 */
export function dockState(
	facts: Pick<DockFacts, "scpOnline" | "locked">,
	occupied: boolean,
): DockState {
	if (!facts.scpOnline) return "fault";
	if (facts.locked) return "loading";
	return occupied ? "occupied" : "free";
}

/** The beacon a state shows: red (do not enter), green (safe to load), orange (wait), off (free). */
export const beaconOf = (state: DockState): Beacon =>
	({ fault: "red", loading: "green", occupied: "orange", free: "off" })[state] as Beacon;

/** How long the door has been open at `now`, in whole seconds; 0 when it's closed. */
export const doorOpenFor = (since: Temporal.Instant | null, now: Temporal.Instant) =>
	since ? seconds(since, now) : 0;

/** The door's band after `openSeconds`: none below 40 minutes, amber below 60, then red. */
export function doorBand(openSeconds: number): DoorBand | null {
	if (openSeconds >= redMinutes * 60) return "red";
	if (openSeconds >= amberMinutes * 60) return "amber";
	return null;
}

const bandRank = (band: DoorBand | null) => (band === "red" ? 2 : band === "amber" ? 1 : 0);

/**
 * What the rules must still do for a dock at `now`: the band its door has reached, if the rules
 * haven't acted on it (or a higher one) yet. Amber notifies the dock planner; red escalates to a
 * breakdown order (and is the notice too, if the door got there unseen).
 */
export function doorAlertDue(
	facts: Pick<DockFacts, "doorOpenSince" | "doorAlert">,
	now: Temporal.Instant,
): DoorBand | null {
	const band = doorBand(doorOpenFor(facts.doorOpenSince, now));
	return bandRank(band) > bandRank(facts.doorAlert) ? band : null;
}

/** What the board's tiles count, over a site's docks. */
interface DockFigures {
	total: number;
	/** Not free. */
	occupied: number;
	locked: number;
	/** Not locked, and not free: a truck at an unsafe dock. */
	unlocked: number;
	doorsOpen: number;
	/** The longest-open door, in seconds; 0 if none is open. */
	longestOpen: number;
}

/** The board's figures for `docks` at `now` (see §2.4's KPIs). */
export function dockFigures(
	docks: { state: DockState; locked: boolean; doorOpenSince: Temporal.Instant | null }[],
	now: Temporal.Instant,
): DockFigures {
	return {
		total: docks.length,
		occupied: docks.filter((dock) => dock.state !== "free").length,
		locked: docks.filter((dock) => dock.locked).length,
		unlocked: docks.filter((dock) => !dock.locked && dock.state !== "free").length,
		doorsOpen: docks.filter((dock) => dock.doorOpenSince).length,
		longestOpen: Math.max(0, ...docks.map((dock) => doorOpenFor(dock.doorOpenSince, now))),
	};
}

/** A dock's code as Salvo sends it and the board shows it, e.g. `DOCK 05`. */
export const dockCodePattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;
