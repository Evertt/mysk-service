/**
 * What the demo's Salvo docks share (the seed, the app's simulation in `simulation.ts`, and the
 * script `scripts/docks-simulator.ts`): SHLTR's token, which the seed stores (its hash) and prints,
 * the docks with Salvo at Weggemans Logistiek, and the states the client's mockup shows them in,
 * which the seed and a reset of the simulation put them in. Known on purpose, for the demo tenant
 * only: a real tenant's tokens are made on its settings page.
 */
import type { DockFacts, SessionFacts } from "../model.ts";

export const demoDockToken = "fwi_shltr0demo0salvo0barneveld0000000000";

/** The Salvo docks of the demo, as the feed names them. */
export const demoSalvoDocks = ["DOCK 05", "DOCK 06", "DOCK 07", "DOCK 08"] as const;
export type DemoDock = (typeof demoSalvoDocks)[number];

/** A demo dock as the mockup shows it: its facts and the truck at it, if any. */
interface MockupDock {
	facts: DockFacts;
	session: SessionFacts | null;
}

/** A quarter-hour slot of 45 minutes from the one `at` is in, as a check-in's planned slot. */
export function slotOf(at: Temporal.Instant) {
	const quarter = 15 * 60;
	const seconds = Math.floor(at.epochMilliseconds / 1000 / quarter) * quarter;
	const start = Temporal.Instant.fromEpochMilliseconds(seconds * 1000);
	return { start, end: start.add({ minutes: 45 }) };
}

/** A session of the truck checked in `checkedIn` seconds before `now`. */
function truck(
	now: Temporal.Instant,
	{
		carrier,
		plate,
		reference,
		checkedIn,
		locked,
		doorOpen,
	}: {
		carrier: string;
		plate: string;
		reference: string;
		checkedIn: number;
		locked?: number;
		doorOpen?: number;
	},
): SessionFacts {
	const ago = (seconds: number) => now.subtract({ seconds });
	const slot = slotOf(ago(checkedIn));
	return {
		carrier,
		plate,
		reference,
		slotStart: slot.start,
		slotEnd: slot.end,
		checkedInAt: ago(checkedIn),
		lockedAt: locked === undefined ? null : ago(locked),
		doorOpenedAt: doorOpen === undefined ? null : ago(doorOpen),
		doorClosedAt: null,
		unlockedAt: null,
		checkedOutAt: null,
		doorOpenSeconds: 0,
	};
}

/**
 * The four docks as the mockup has them at `now`: DOCK 05 Laden (locked, door open 23:40), DOCK 06
 * Bezet (not locked, the key with the driver, door open 44:40: amber), DOCK 07 Vrij (the key in
 * the key storage), DOCK 08 Storing (the SCP's key fault, door open 1:27:20: red). The door rules
 * have acted on 06's and 08's open doors already (`doorAlert`), so putting them back makes no
 * notice or order by itself. Each last reported when its state came about (05's and 06's door
 * opened, 08's fault, 07 quiet for two hours), so a feed's events from the last hour or so still
 * apply; the simulation counts on from its start (`startedAt`), not from these.
 */
export function mockupDocks(now: Temporal.Instant): Record<DemoDock, MockupDock> {
	const ago = (seconds: number) => now.subtract({ seconds });
	const base: DockFacts = {
		locked: false,
		doorOpenSince: null,
		scpOnline: true,
		faultReason: null,
		keyLocation: "scp",
		doorAlert: null,
		lastEventAt: null,
	};
	return {
		"DOCK 05": {
			facts: { ...base, locked: true, doorOpenSince: ago(1420), lastEventAt: ago(1420) },
			session: truck(now, {
				carrier: "AMEX Transport",
				plate: "84-BNX-7",
				reference: "WB-20416",
				checkedIn: 1420 + 300,
				locked: 1420 + 120,
				doorOpen: 1420,
			}),
		},
		"DOCK 06": {
			facts: {
				...base,
				doorOpenSince: ago(2680),
				keyLocation: "driver",
				doorAlert: "amber",
				lastEventAt: ago(2680),
			},
			session: truck(now, {
				carrier: "AMEX Transport",
				plate: "12-VDK-3",
				reference: "WB-20417",
				checkedIn: 2680 + 180,
				doorOpen: 2680,
			}),
		},
		"DOCK 07": {
			facts: { ...base, keyLocation: "storage", lastEventAt: ago(2 * 3600) },
			session: null,
		},
		"DOCK 08": {
			facts: {
				...base,
				doorOpenSince: ago(5240),
				scpOnline: false,
				faultReason: "Sleutelfout",
				keyLocation: "driver",
				doorAlert: "red",
				lastEventAt: ago(34 * 60),
			},
			session: truck(now, {
				carrier: "AMEX Transport",
				plate: "51-JPR-9",
				reference: "WB-20419",
				checkedIn: 5240 + 240,
				doorOpen: 5240,
			}),
		},
	};
}
