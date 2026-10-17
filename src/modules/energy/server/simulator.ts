/**
 * The energy simulator, for development: posts a day of SHLTR's "Riedel Ede — Productielocatie"
 * (`riedel.ts`, the simulation in `../simulation.ts`) to a running app's feed, as a gateway would
 * (`../docs/ingest.md`). Today up to the last quarter hour that ended, or a whole past day:
 *
 * ```sh
 * node src/modules/energy/server/simulator.ts [--url=http://localhost:5173] [--day=2026-10-12]
 * ```
 *
 * With the demo token the seed gives SHLTR, or `ENERGY_TOKEN`. The site is found through
 * `GET /energy/ingest` (the token's first site, or `--site=<id>`). Plain Node.
 */
import "temporal-polyfill/global";
import { simulateDay } from "../simulation.ts";
import {
	DEMO_ENERGY_TOKEN,
	riedelDoors,
	riedelSite,
	riedelZones,
	SIMULATION_SEED,
} from "./riedel.ts";

const options = Object.fromEntries(
	process.argv.slice(2).flatMap((argument) => {
		const match = /^--(\w+)=(.*)$/.exec(argument);
		return match ? [[match[1], match[2]]] : [];
	}),
);
const origin = options.url ?? process.env.ORIGIN ?? "http://localhost:5173";
const token = process.env.ENERGY_TOKEN ?? DEMO_ENERGY_TOKEN;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const feed = new URL("/energy/ingest", origin);

const found = await fetch(feed, { headers });
if (!found.ok) {
	console.error(`GET ${feed}: ${found.status} ${await found.text()}`);
	process.exit(1);
}
const { sites } = (await found.json()) as { sites: { id: number; name: string }[] };
const site = options.site ? sites.find((s) => s.id === Number(options.site)) : sites[0];
if (!site) {
	console.error(`No energy site ${options.site ?? ""} for this token.`);
	process.exit(1);
}

const now = Temporal.Now.instant();
const day = options.day
	? Temporal.PlainDate.from(options.day)
	: now.toZonedDateTimeISO(riedelSite.timeZone).toPlainDate();
const { readings, doorEvents } = simulateDay({
	zones: riedelZones,
	doors: riedelDoors,
	day,
	timeZone: riedelSite.timeZone,
	seed: SIMULATION_SEED,
	until: now,
});

const response = await fetch(feed, {
	method: "POST",
	headers,
	body: JSON.stringify({
		site: site.id,
		readings: readings.map((r) => ({ ...r, start: r.start.toString() })),
		doorEvents: doorEvents.map((e) => ({
			door: e.door,
			at: e.at.toString(),
			state: e.open ? "open" : "closed",
		})),
	}),
});
console.info(`${site.name}, ${day.toString()}: ${response.status} ${await response.text()}`);
if (!response.ok) process.exitCode = 1;
