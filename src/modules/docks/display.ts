/** How the docks module shows its states: badge tones, the beacon's colour and the timer's. */
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

import { type Beacon, type DockState, doorBand } from "./model.ts";

/** A state's badge: Laden is fine, Bezet needs attention, Storing is critical, Vrij is quiet. */
export const stateTones: Record<DockState, BadgeTone> = {
	loading: "success",
	occupied: "warning",
	fault: "danger",
	free: "neutral",
};

/** The beacon's lamp. */
export const beaconColours: Record<Beacon, string> = {
	green: "bg-emerald-500",
	orange: "bg-amber-500",
	red: "bg-rose-600",
	off: "bg-muted-foreground/30",
};

/** The door timer's colour after `seconds` open: amber from 40 minutes, rose from 60. */
export function timerClass(seconds: number) {
	const band = doorBand(seconds);
	if (band === "red") return "text-rose-600 dark:text-rose-400";
	if (band === "amber") return "text-amber-600 dark:text-amber-400";
	return "";
}
