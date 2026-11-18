/**
 * The energy module's part of a unit's timeline (`equipment.timeline`) and figures
 * (`equipment.figures`), for a unit that is one of its monitored doors: the door's openings,
 * grouped so a busy door doesn't flood the list (an opening as long as its threshold or longer is
 * an entry of its own, "14 min open — energy loss measured"; the shorter ones roll up per hour,
 * "12× opened · 0.4 kWh lost"), its alerts (the office's, as the access registry has it), and
 * today's times opened and energy lost. Who reads the door (the office, the contacts at its site,
 * an engineer with the unit on one of their orders) gets them; anyone else, nothing.
 */
import { and, desc, eq, lt, lte, sql } from "drizzle-orm";

import { momentSeconds } from "#lib/dates.ts";
import type { FiguresQuery, TimelineQuery } from "#lib/equipment/extensions.ts";
import {
	answerOf,
	isAfter,
	type TimelineAnswer,
	type TimelineCursor,
	type TimelineEntry,
	type TimelineFigure,
} from "#lib/equipment/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { visible } from "#lib/server/access/index.ts";
import type { MemberViewer } from "#lib/server/access/viewer.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";

import { doorLossKwh, minutesOpenBetween, type Opening, openings, openMinutes } from "../model.ts";
import { doorEvents } from "./door-events.ts";
import { energyAlert, energyDoor, energyDoorEvent } from "./schema.ts";

/** A monitored door that is the unit. */
export interface UnitDoor {
	id: number;
	code: string;
	lossKw: number;
	thresholdMinutes: number;
}

const HOUR_SECONDS = 3600;

/** The unit's monitored doors the viewer reads (none: the unit isn't one, or isn't theirs to see). */
async function doorsOf(unitId: number, asking: MemberViewer): Promise<UnitDoor[]> {
	const readable = await visible("energy_door", "read", asking);
	if (!readable) return [];
	return db
		.select({
			id: energyDoor.id,
			code: energyDoor.code,
			lossKw: energyDoor.lossKw,
			thresholdMinutes: energyDoor.thresholdMinutes,
		})
		.from(energyDoor)
		.where(and(inTenant(energyDoor), eq(energyDoor.equipmentId, unitId), readable));
}

/** A number of kWh as the timeline shows it: one decimal. */
const kwh = (value: number) => formatNumber(Math.round(value * 10) / 10);

/**
 * The entries of the doors' openings that started in `[from, to)`: each one at least its door's
 * threshold long on its own, the rest by door and hour (from the hour's start). Hours are whole
 * hours of the moment's own seconds, which the windows are aligned to.
 */
export function openingEntries(
	doors: readonly UnitDoor[],
	byDoor: ReadonlyMap<number, readonly Opening[]>,
	from: Temporal.Instant,
	to: Temporal.Instant,
	now: Temporal.Instant,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	const named = doors.length > 1;
	for (const door of doors) {
		const hours = new Map<number, { count: number; minutes: number }>();
		for (const opening of byDoor.get(door.id) ?? []) {
			if (
				Temporal.Instant.compare(opening.openedAt, from) < 0 ||
				Temporal.Instant.compare(opening.openedAt, to) >= 0
			) {
				continue;
			}
			const minutes = openMinutes(opening, now);
			if (minutes >= door.thresholdMinutes) {
				const lost = kwh(doorLossKwh(minutes, door.lossKw));
				entries.push({
					id: `energy:open:${door.id}:${momentSeconds(opening.openedAt)}`,
					at: opening.openedAt,
					kind: "energy.opening",
					title: m.energy_timeline_long({ minutes: formatNumber(Math.round(minutes)) }),
					detail: [named ? door.code : null, m.energy_timeline_lost({ kwh: lost })]
						.filter(Boolean)
						.join(" · "),
					tone: "warning",
					icon: "door",
				});
				continue;
			}
			const hour = Math.floor(momentSeconds(opening.openedAt) / HOUR_SECONDS) * HOUR_SECONDS;
			const sum = hours.get(hour) ?? { count: 0, minutes: 0 };
			hours.set(hour, { count: sum.count + 1, minutes: sum.minutes + minutes });
		}
		for (const [hour, { count, minutes }] of hours) {
			entries.push({
				id: `energy:hour:${door.id}:${hour}`,
				at: Temporal.Instant.fromEpochMilliseconds(hour * 1000),
				kind: "energy.hour",
				title: m.energy_timeline_hour({
					count: formatNumber(count),
					kwh: kwh(doorLossKwh(minutes, door.lossKw)),
				}),
				detail: named ? door.code : null,
				tone: "neutral",
				icon: "door",
			});
		}
	}
	return entries;
}

/** The first whole hour at or after `moment`. */
const hourAfter = (moment: Temporal.Instant) =>
	Temporal.Instant.fromEpochMilliseconds(
		Math.ceil(momentSeconds(moment) / HOUR_SECONDS) * HOUR_SECONDS * 1000,
	);

/**
 * The doors' opening entries for a page after `before`: read a window back from it (a day at
 * first, twice as long each time it finds too few), until it has more than `limit` or the doors
 * have no older events. Windows end on a whole hour, so an hour's roll-up is always whole.
 */
async function openingsPage(
	doors: readonly UnitDoor[],
	before: TimelineCursor | null,
	limit: number,
	now: Temporal.Instant,
) {
	const ids = doors.map((door) => door.id);
	let to = hourAfter(before ? before.at.add({ seconds: 1 }) : now);
	let hours = 24;
	const found: TimelineEntry[] = [];
	for (let round = 0; round < 8; round++) {
		const from = to.subtract({ hours });
		// A day past the window too, for the closes of the openings that started in it.
		const events = await doorEvents(db, ids, from, to.add({ hours: 24 }));
		const byDoor = new Map(
			ids.map((id) => [id, openings(events.filter((event) => event.doorId === id))]),
		);
		found.push(...openingEntries(doors, byDoor, from, to, now));
		if (found.filter((entry) => isAfter(entry, before)).length > limit) {
			return { entries: found, more: true };
		}
		const [older] = await db
			.select({ at: sql<number | null>`max(${energyDoorEvent.at})` })
			.from(energyDoorEvent)
			.where(
				and(
					inTenant(energyDoorEvent),
					inList(energyDoorEvent.doorId, ids),
					lt(energyDoorEvent.at, from),
				),
			);
		if (older?.at === null || older?.at === undefined) return { entries: found, more: false };
		// Past a gap without events at once.
		const latestOlder = hourAfter(
			Temporal.Instant.fromEpochMilliseconds((Number(older.at) + 1) * 1000),
		);
		to = Temporal.Instant.compare(latestOlder, from) < 0 ? latestOlder : from;
		hours *= 2;
	}
	return { entries: found, more: true };
}

/** The doors' alerts, newest first, for the office (the access registry's `energy_alert`). */
async function alertEntries(
	doors: readonly UnitDoor[],
	query: TimelineQuery,
): Promise<{ entries: TimelineEntry[]; more: boolean }> {
	const readable = await visible("energy_alert", "read", query.viewer);
	if (!readable) return { entries: [], more: false };
	const rows = await db
		.select({
			id: energyAlert.id,
			at: energyAlert.at,
			threshold: energyAlert.threshold,
			measured: energyAlert.measured,
			status: energyAlert.status,
			order: order.number,
		})
		.from(energyAlert)
		.leftJoin(...tenantJoin(order, energyAlert.orderId))
		.where(
			and(
				inTenant(energyAlert),
				readable,
				inList(
					energyAlert.doorId,
					doors.map((door) => door.id),
				),
				query.before ? lte(energyAlert.at, query.before.at) : undefined,
			),
		)
		.orderBy(desc(energyAlert.at), desc(energyAlert.id))
		.limit(query.limit + 1);
	return {
		entries: rows.map((row) => ({
			id: `energy:alert:${row.id}`,
			// When it was raised: once the door had been open its threshold.
			at: row.at.add({ seconds: Math.round(row.threshold * 60) }),
			kind: "energy.alert",
			title: m.energy_timeline_alert({ minutes: formatNumber(row.threshold) }),
			detail:
				row.status === "done"
					? m.energy_timeline_alert_done()
					: row.status === "order"
						? m.energy_timeline_alert_ordered()
						: null,
			order: row.order,
			tone: row.status === "done" ? "neutral" : "danger",
			icon: "alert",
		})),
		more: rows.length > query.limit,
	};
}

/** The unit's door openings and alerts for a page of its timeline. */
export async function doorTimeline(query: TimelineQuery): Promise<TimelineAnswer> {
	const doors = await doorsOf(query.unit.id, query.viewer);
	if (!doors.length) return { entries: [], more: false };
	const now = Temporal.Now.instant();
	const [opened, alerts] = await Promise.all([
		openingsPage(doors, query.before, query.limit, now),
		alertEntries(doors, query),
	]);
	return {
		...answerOf(
			[...opened.entries, ...alerts.entries],
			query.before,
			query.limit,
			opened.more || alerts.more,
		),
		// Each batch of the doors' events comes with the meters' readings, which announce it.
		liveTypes: ["energy_reading", "energy_alert"],
	};
}

/** Today's times the unit's doors opened, and the energy they lost. */
export async function doorFigures(query: FiguresQuery): Promise<TimelineFigure[]> {
	const doors = await doorsOf(query.unit.id, query.viewer);
	if (!doors.length) return [];
	const events = await doorEvents(
		db,
		doors.map((door) => door.id),
		query.from,
		query.to,
	);
	let opened = 0;
	let lost = 0;
	for (const door of doors) {
		const own = openings(events.filter((event) => event.doorId === door.id));
		opened += own.filter((each) => Temporal.Instant.compare(each.openedAt, query.from) >= 0).length;
		lost += doorLossKwh(minutesOpenBetween(own, query.from, query.to), door.lossKw);
	}
	return [
		{ key: "energy.opened", label: m.energy_timeline_opened_today(), value: formatNumber(opened) },
		{
			key: "energy.lost",
			label: m.energy_timeline_lost_today(),
			value: m.energy_timeline_kwh({ kwh: kwh(lost) }),
			tone: lost > 0 ? "warning" : "neutral",
		},
	];
}
