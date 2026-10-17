import {
	beaconOf,
	type DockState,
	doorBand,
	doorOpenFor,
	dockState,
	type DoorBand,
} from "../model.ts";
/** What the board's components share: its data's types, and a dock's state and warnings from it. */
import type { getDockBoard } from "./board.remote.ts";

export type DockBoard = Awaited<ReturnType<typeof getDockBoard>>;
export type BoardDock = DockBoard["docks"][number];

/** A dock as the board shows it at `now`: its state, beacon, door timer and warning. */
export function dockView(dock: BoardDock, now: Temporal.Instant) {
	const facts = { scpOnline: dock.scpOnline ?? true, locked: dock.locked ?? false };
	const state: DockState = dockState(facts, dock.session !== null);
	const openSeconds = doorOpenFor(dock.doorOpenSince, now);
	const band: DoorBand | null = doorBand(openSeconds);
	// The card's warnings: red ones (a fault, a door open an hour) before amber ones.
	const warnings: ("fault" | "unlocked" | DoorBand)[] = [];
	if (state === "fault") warnings.push("fault");
	if (band === "red") warnings.push("red");
	if (state === "occupied") warnings.push("unlocked");
	if (band === "amber") warnings.push("amber");
	return { state, beacon: beaconOf(state), openSeconds, band, warnings };
}
