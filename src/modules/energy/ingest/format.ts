/**
 * The ingest format: what a site's gateway posts to `POST /energy/ingest` (the module's integration
 * endpoint, `routes/(api)/ingest/+server.ts`), checked here: `docs/ingest.md` describes it for
 * whoever connects a gateway. Readings are aggregates per 15 minutes, so the app's database (one
 * Durable Object on Cloudflare) takes a batch at a time, never a meter's telegrams.
 */
import * as v from "valibot";

import { momentSeconds } from "#lib/dates.ts";
import { type BatchIssue, batchIssues } from "#lib/modules/batch-issues.ts";

import { INTERVAL_MINUTES } from "../model.ts";

export const MAX_READINGS = 2000;
const MAX_DOOR_EVENTS = 2000;
export const MAX_BODY_BYTES = 1_000_000;
/** How far back a batch may go. */
const MAX_AGE_DAYS = 90;

/** A zone's or door's code, as the site has them (`Z-R61`, `D-05`). */
const code = () =>
	v.pipe(
		v.string(m.energy_ingest_code),
		v.trim(),
		v.minLength(1, m.energy_ingest_code),
		v.maxLength(40, m.energy_ingest_code),
	);

/** An ISO 8601 moment with its offset, e.g. `2026-10-17T08:00:00Z`. */
const moment = () =>
	v.pipe(
		v.string(m.energy_ingest_moment),
		v.check((text) => {
			try {
				Temporal.Instant.from(text);
				return true;
			} catch {
				return false;
			}
		}, m.energy_ingest_moment),
		v.transform((text) => Temporal.Instant.from(text)),
	);

const kw = () =>
	v.pipe(
		v.number(m.energy_ingest_power),
		v.finite(m.energy_ingest_power),
		v.minValue(0, m.energy_ingest_power),
		v.maxValue(100_000, m.energy_ingest_power),
	);

/** Whether `start` is on a quarter hour, in whole minutes. */
const onQuarter = (start: Temporal.Instant) => {
	const seconds = start.epochMilliseconds / 1000;
	return Number.isInteger(seconds) && seconds % (INTERVAL_MINUTES * 60) === 0;
};

const reading = v.pipe(
	v.strictObject(
		{
			zone: code(),
			start: v.pipe(moment(), v.check(onQuarter, m.energy_ingest_quarter)),
			avgKw: kw(),
			peakKw: kw(),
			kwh: v.pipe(
				v.number(m.energy_ingest_energy),
				v.finite(m.energy_ingest_energy),
				v.minValue(0, m.energy_ingest_energy),
			),
		},
		m.energy_ingest_unknown_field,
	),
	v.check((r) => r.peakKw + 1e-6 >= r.avgKw, m.energy_ingest_peak_below_average),
	v.check(
		(r) => Math.abs(r.kwh - r.avgKw / 4) <= Math.max(0.01, (r.avgKw / 4) * 0.02),
		m.energy_ingest_energy_mismatch,
	),
);

const doorEvent = v.strictObject(
	{
		door: code(),
		at: moment(),
		state: v.picklist(["open", "closed"], m.energy_ingest_state),
	},
	m.energy_ingest_unknown_field,
);

/** A batch as posted (see above), before it's checked against the clock and the site. */
const batchSchema = v.strictObject(
	{
		site: v.pipe(v.number(m.energy_ingest_site), v.integer(m.energy_ingest_site), v.minValue(1)),
		readings: v.optional(
			v.pipe(
				v.array(reading, m.energy_ingest_list),
				v.maxLength(MAX_READINGS, () => m.energy_ingest_too_many({ max: String(MAX_READINGS) })),
			),
			[],
		),
		doorEvents: v.optional(
			v.pipe(
				v.array(doorEvent, m.energy_ingest_list),
				v.maxLength(MAX_DOOR_EVENTS, () =>
					m.energy_ingest_too_many({ max: String(MAX_DOOR_EVENTS) }),
				),
			),
			[],
		),
	},
	m.energy_ingest_unknown_field,
);

export type Batch = v.InferOutput<typeof batchSchema>;

/**
 * The batch in `body` (parsed JSON), or what's wrong with it: its format's issues, each with
 * where it is, then what the clock refuses (an interval that hasn't ended, an event in the future,
 * anything older than 90 days) and what's in it twice.
 */
export function parseBatch(
	body: unknown,
	now: Temporal.Instant,
): { batch: Batch; issues?: undefined } | { batch?: undefined; issues: BatchIssue[] } {
	const parsed = v.safeParse(batchSchema, body);
	if (!parsed.success) return { issues: batchIssues(parsed.issues) };
	const batch = parsed.output;
	const issues: BatchIssue[] = [];
	const issue = (path: string, message: string) => issues.push({ path, message });
	if (!batch.readings.length && !batch.doorEvents.length) issue("", m.energy_ingest_empty());

	const oldest = now.subtract({ hours: MAX_AGE_DAYS * 24 });
	const tooOld = (at: Temporal.Instant) => Temporal.Instant.compare(at, oldest) < 0;
	const seenReadings = new Set<string>();
	batch.readings.forEach((r, i) => {
		const ends = r.start.add({ minutes: INTERVAL_MINUTES });
		if (Temporal.Instant.compare(ends, now) > 0) {
			issue(`readings.${i}.start`, m.energy_ingest_not_ended());
		} else if (tooOld(r.start)) {
			issue(`readings.${i}.start`, m.energy_ingest_too_old({ days: String(MAX_AGE_DAYS) }));
		}
		const key = `${r.zone}|${r.start.epochMilliseconds}`;
		if (seenReadings.has(key)) issue(`readings.${i}`, m.energy_ingest_duplicate());
		seenReadings.add(key);
	});
	const seenEvents = new Set<string>();
	batch.doorEvents.forEach((e, i) => {
		// A minute's leeway for the gateway's clock.
		if (Temporal.Instant.compare(e.at, now.add({ minutes: 1 })) > 0) {
			issue(`doorEvents.${i}.at`, m.energy_ingest_future());
		} else if (tooOld(e.at)) {
			issue(`doorEvents.${i}.at`, m.energy_ingest_too_old({ days: String(MAX_AGE_DAYS) }));
		}
		// By the second, as it's stored: two in the same second would be the same row.
		const key = `${e.door}|${momentSeconds(e.at)}|${e.state}`;
		if (seenEvents.has(key)) issue(`doorEvents.${i}`, m.energy_ingest_duplicate());
		seenEvents.add(key);
	});
	return issues.length ? { issues } : { batch };
}

/** What a stored batch answers: readings stored, door events new, alerts raised. */
export interface IngestResult {
	readings: number;
	doorEvents: number;
	alerts: number;
}
