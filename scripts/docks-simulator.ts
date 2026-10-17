/**
 * The app now simulates the demo's docks by itself (the docks' `server/simulation.ts`, driven by
 * the simulation bar on the board and the minute cron, see `#lib/server/simulation.ts`): this
 * script stays for local use, e.g. to feed a dev server from outside, through its HTTP endpoint,
 * as a real Salvo adapter would. Pause the board's simulation first, or the two take turns.
 *
 * The Salvo simulator script (`pnpm docks:simulate`): posts realistic event
 * streams for SHLTR's Weggemans docks 05–08 to a running dev server's feed (`POST /docks/ingest`,
 * see `src/modules/docks/docs/salvo-events.md`), so the live board (`/docks`) moves. Each dock goes
 * round its cycle on its own: a truck checks in (the key goes with the driver), the driver locks
 * the Wheel-Lok (the key back in the SCP), the door opens and closes, the Wheel-Lok releases and
 * the truck checks out; DOCK 08's SCP now and then has a fault and recovers.
 *
 *   pnpm docks:simulate [--origin http://localhost:5173] [--token fwi_…] [--step 4] [--steps 40]
 *   pnpm docks:simulate --escalate   # DOCK 07's door open since 61 minutes ago: the 60-minute rule
 *
 * The token is the demo tenant's by default (the seed prints it); `--step` is the seconds between
 * batches, `--steps` how many to send (endless without). Not for production: it makes up trucks.
 */
import { demoDockToken, demoSalvoDocks } from "../src/modules/docks/server/demo.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
	const at = args.indexOf(`--${name}`);
	return at >= 0 ? args[at + 1] : undefined;
};
const origin = option("origin") ?? process.env.ORIGIN ?? "http://localhost:5173";
const token = option("token") ?? process.env.DOCKS_TOKEN ?? demoDockToken;
const step = Number(option("step") ?? 4) * 1000;
const steps = option("steps") ? Number(option("steps")) : Infinity;
const escalate = args.includes("--escalate");

const run = Date.now().toString(36);
let counter = 0;

interface SimEvent {
	id: string;
	type: string;
	dock: string;
	at: string;
	payload?: Record<string, unknown>;
}

const event = (dock: string, type: string, payload?: Record<string, unknown>, at = new Date()) => ({
	id: `sim-${run}-${++counter}`,
	type,
	dock,
	at: at.toISOString(),
	...(payload ? { payload } : {}),
});

async function post(events: SimEvent[]) {
	const response = await fetch(new URL("/docks/ingest", origin), {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({ events }),
	});
	const text = await response.text();
	const summary = events.map((each) => `${each.dock} ${each.type}`).join(", ") || "heartbeat";
	console.info(`${new Date().toLocaleTimeString()} ${response.status} ${summary}: ${text}`);
	if (response.status === 401 || response.status === 404) {
		console.error("The token isn't valid for a tenant with the docks module: see --token.");
		process.exit(1);
	}
}

const carriers = ["AMEX Transport", "Van der Wal Logistiek", "Bakker Transport", "Mooy Logistics"];
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const letters = () =>
	Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
		"",
	);
const plate = () =>
	`${10 + Math.floor(Math.random() * 90)}-${letters()}-${1 + Math.floor(Math.random() * 9)}`;

/** Each dock's next steps in its cycle, as functions that make its events. */
type Step = () => SimEvent[];
function cycle(dock: string): Step[] {
	const start = new Date();
	const slot = {
		start: start.toISOString(),
		end: new Date(start.getTime() + 45 * 60_000).toISOString(),
	};
	const truck = {
		carrier: pick(carriers),
		plate: plate(),
		reference: `WB-${20_420 + Math.floor(Math.random() * 500)}`,
		slot,
	};
	return [
		() => [event(dock, "check_in", truck), event(dock, "key_moved", { to: "driver" })],
		() => [event(dock, "key_moved", { to: "scp" }), event(dock, "lock")],
		() => [event(dock, "door_open")],
		() => [],
		() => [event(dock, "door_close")],
		() => [event(dock, "unlock"), event(dock, "key_moved", { to: "driver" })],
		() => [event(dock, "check_out"), event(dock, "key_moved", { to: "scp" })],
		() => [],
	];
}

const plans = new Map<string, Step[]>(
	demoSalvoDocks.filter((dock) => dock !== "DOCK 08").map((dock) => [dock, []]),
);
// The docks start their cycles at different times.
let offset = 0;
for (const plan of plans.values()) {
	plan.push(...Array.from({ length: offset }, () => () => []));
	offset += 2;
}

if (escalate) {
	// DOCK 07: a truck since 75 minutes, its door open since 61: the next batch's rules escalate.
	const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
	await post([
		event(
			"DOCK 07",
			"check_in",
			{ carrier: "Bakker Transport", plate: plate(), reference: "WB-20999" },
			ago(75),
		),
		event("DOCK 07", "key_moved", { to: "scp" }, ago(70)),
		event("DOCK 07", "lock", undefined, ago(70)),
		event("DOCK 07", "door_open", undefined, ago(61)),
	]);
	plans.delete("DOCK 07");
}

for (let sent = 0; sent < steps; sent++) {
	const events: SimEvent[] = [];
	for (const [dock, plan] of plans) {
		if (!plan.length) plan.push(...cycle(dock));
		events.push(...plan.shift()!());
	}
	// DOCK 08's SCP: its fault clears now and then, and comes back.
	if (sent % 12 === 6) events.push(event("DOCK 08", "scp_ok"));
	if (sent % 12 === 9) events.push(event("DOCK 08", "scp_fault", { reason: "Sleutelfout" }));
	await post(events);
	await new Promise((done) => setTimeout(done, step));
}
