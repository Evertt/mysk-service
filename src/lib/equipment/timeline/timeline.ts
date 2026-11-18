/**
 * A unit's timeline ("Wat gebeurt er met deze deur?"): everything that happened to it, newest first,
 * in one list mixing what the core logs (reports, its orders' steps, photos, documents) and what the
 * tenant's modules answer (door openings, conditions measured, inspections), with today's figures
 * above it. The entries and figures are made on the server, in the request's language, for the
 * viewer (`equipment.timeline`, `equipment.figures` in `../extensions.ts`); this file is their shape
 * and the rules a page of them follows, shared by the server and the shells' component.
 */

/** How an entry is coloured: by meaning, as the theme's tone tokens are. */
export const timelineTones = ["neutral", "info", "success", "warning", "danger"] as const;
export type TimelineTone = (typeof timelineTones)[number];

/** The icon an entry shows, by what happened (the component maps each to its icon). */
export const timelineIcons = [
	"door",
	"energy",
	"alert",
	"report",
	"order",
	"scheduled",
	"on_the_way",
	"started",
	"completed",
	"cancelled",
	"photo",
	"document",
	"condition",
	"inspection",
	"installed",
	"warranty",
] as const;
export type TimelineIcon = (typeof timelineIcons)[number];

/** A photo shown small with an entry, served at `src` to whoever may read it. */
export interface TimelinePhoto {
	id: number;
	src: string;
}

/** Something that happened to the unit, as the viewer may see it. */
export interface TimelineEntry {
	/** Unique in the timeline and stable between reads: its source's prefix and its own key. */
	id: string;
	at: Temporal.Instant;
	/** What it is, by its source, e.g. `order.completed`, `energy.opening`. */
	kind: string;
	/** E.g. "14 min open — energy loss measured". */
	title: string;
	/** A line below it, e.g. "2.7 kWh lost". */
	detail?: string | null;
	/** The order it's about, by its number: a link to its page in the viewer's shell. */
	order?: string | null;
	photos?: TimelinePhoto[];
	tone: TimelineTone;
	icon: TimelineIcon;
}

/** Where a page of the timeline starts: after this entry (the last one of the page before). */
export interface TimelineCursor {
	at: Temporal.Instant;
	id: string;
}

/** A source's answer: its newest entries after the cursor, and whether it has older ones. */
export interface TimelineAnswer {
	entries: TimelineEntry[];
	/** It has more entries, older than its last one, that it didn't answer. */
	more: boolean;
	/**
	 * The change types (the shells' feeds') whose changes may change its entries, beyond the unit's
	 * and its orders': e.g. energy's readings, announced with the doors' events.
	 */
	liveTypes?: string[];
}

/** A headline figure of today, e.g. "Opened today: 23". */
export interface TimelineFigure {
	key: string;
	label: string;
	value: string;
	detail?: string | null;
	tone?: TimelineTone;
}

/** Entries per page. */
export const TIMELINE_PAGE = 25;

/** Timeline order: newest first, then by id, so every entry has one place. */
export function compareEntries(
	a: Pick<TimelineEntry, "at" | "id">,
	b: Pick<TimelineEntry, "at" | "id">,
) {
	return Temporal.Instant.compare(b.at, a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Whether `entry` comes after `cursor` in timeline order (on a later page); any without one. */
export const isAfter = (entry: Pick<TimelineEntry, "at" | "id">, cursor: TimelineCursor | null) =>
	!cursor || compareEntries(cursor, entry) < 0;

/**
 * Of a source's entries (any order), its answer for a page after `cursor` of at most `limit`:
 * those after the cursor, newest first, and whether it left any out.
 */
export function answerOf(
	entries: readonly TimelineEntry[],
	cursor: TimelineCursor | null,
	limit: number,
	more = false,
): TimelineAnswer {
	const after = entries.filter((entry) => isAfter(entry, cursor)).sort(compareEntries);
	return { entries: after.slice(0, limit), more: more || after.length > limit };
}

/**
 * One page of the timeline from the sources' answers: their entries merged in timeline order, at
 * most `limit`, and the cursor of the next page (`null`: none). A source that has older entries
 * than it answered holds the page back to its last one, so none of its older entries is passed by
 * another source's.
 */
export function pageOf(answers: readonly TimelineAnswer[], limit: number) {
	const merged = answers.flatMap((answer) => answer.entries).sort(compareEntries);
	const held = answers
		.filter((answer) => answer.more && answer.entries.length)
		.map((answer) =>
			answer.entries.reduce((last, entry) => (compareEntries(last, entry) < 0 ? entry : last)),
		);
	// The earliest place where a source stops: nothing past it on this page.
	const stop = held.reduce<TimelineEntry | null>(
		(first, entry) => (!first || compareEntries(entry, first) < 0 ? entry : first),
		null,
	);
	const shown = (stop ? merged.filter((entry) => compareEntries(entry, stop) <= 0) : merged).slice(
		0,
		limit,
	);
	const more = shown.length < merged.length || answers.some((answer) => answer.more);
	const last = shown.at(-1);
	return {
		entries: shown,
		next: more && last ? { at: last.at, id: last.id } : null,
	};
}

/** The entries by day (in the user's time zone, `dayOf`), newest day first, in timeline order. */
export function byDay(
	entries: readonly TimelineEntry[],
	dayOf: (moment: Temporal.Instant) => Temporal.PlainDate,
) {
	const days: { day: Temporal.PlainDate; entries: TimelineEntry[] }[] = [];
	for (const entry of [...entries].sort(compareEntries)) {
		const day = dayOf(entry.at);
		const last = days.at(-1);
		if (last && last.day.equals(day)) last.entries.push(entry);
		else days.push({ day, entries: [entry] });
	}
	return days;
}
