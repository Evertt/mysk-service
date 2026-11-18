/**
 * A unit's timeline on the server (`../timeline/timeline.ts` is its model): a page of it for the
 * viewer, merged from the core's entries and the modules' (`equipment.timeline`), and today's
 * figures (`equipment.figures`). The core's entries are its installation (and, for the office, the
 * end of its warranty) and what the activity log says of the unit and of the orders on it that the
 * viewer may read: reported (and how: a scanned QR code, the portal), created, accepted, planned
 * (with the engineer), on the way, started, completed (with its photos), cancelled or not accepted,
 * photos added, documents added. A customer's contact reads no one's name but the engineer's first
 * name, nor anything the office keeps to itself; an engineer reads first names only.
 */
import { and, desc, eq, lte, or, sql } from "drizzle-orm";

import { currentDay, dayOf, startOfDay } from "#lib/dates.ts";
import { firstName } from "#lib/engineers/index.ts";
import { formatDateTime, label } from "#lib/i18n/index.ts";
import type { OrderType, ReportChannel } from "#lib/models.ts";
import { onUnit, photosOf } from "#lib/orders/server/index.ts";
import { readOrNotFound, visibleOrNone } from "#lib/server/access/index.ts";
import { type MemberViewer, viewer } from "#lib/server/access/viewer.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { activity, engineer, equipment, order, orderRequest } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

import { isUnderWarranty } from "../display.ts";
import { figures, timeline, type TimelineQuery } from "../extensions.ts";
import {
	answerOf,
	pageOf,
	TIMELINE_PAGE,
	type TimelineAnswer,
	type TimelineCursor,
	type TimelineEntry,
	type TimelinePhoto,
} from "../timeline/timeline.ts";
import { unitBySerial } from "./lookup.ts";

/** The order actions the timeline tells, besides `updated` to completed or cancelled. */
const orderActions = [
	"created",
	"accepted",
	"scheduled",
	"departed",
	"work_started",
	"completed",
	"rejected",
	"updated",
] as const;

/** Steps of an order this close together read as one (accepted and planned at once). */
const TOGETHER_SECONDS = 120;

/** Photos added this long before an order's completion are shown with it. */
const PHOTOS_BEFORE_MINUTES = 15;

/** An order's photos as the timeline shows them, served at `/photos/<id>`. */
const orderPhotos = (photos: readonly { id: number }[]): TimelinePhoto[] =>
	photos.map(({ id }) => ({ id, src: `/photos/${id}` }));

/** A person's name as `viewer` may read it: in full for the office, else the first name. */
const nameFor = (asking: MemberViewer, name: string) =>
	asking.audience === "office" ? name : firstName(name);

type Row = typeof activity.$inferSelect;

/** The status an `updated` entry set, if it set one. */
const statusSet = (row: Row) => {
	const change = row.changes?.status as [unknown, unknown] | undefined;
	return typeof change?.[1] === "string" ? change[1] : null;
};

/** The value an entry's change set, if any. */
const changedTo = (row: Row, field: string) => (row.changes?.[field] as unknown[] | undefined)?.[1];

/**
 * The core's entries of the unit for a page after `before`: its installation, its warranty's end
 * (the office's), and what the log says of it and of its orders the viewer reads.
 */
export async function coreEntries(
	query: TimelineQuery,
	unit: { installedAt: Temporal.PlainDate; warrantyUntil: Temporal.PlainDate },
): Promise<TimelineAnswer> {
	const { viewer: asking, before, limit } = query;
	const office = asking.audience === "office";
	const own: TimelineEntry[] = [
		{
			id: "unit:installed",
			at: startOfDay(unit.installedAt),
			kind: "unit.installed",
			title: m.equipment_timeline_installed(),
			tone: "neutral",
			icon: "installed",
		},
	];
	if (office) {
		const upcoming = isUnderWarranty(unit.warrantyUntil, Temporal.Now.instant());
		own.push({
			id: "unit:warranty",
			at: startOfDay(unit.warrantyUntil),
			kind: "unit.warranty",
			title: upcoming ? m.equipment_history_warranty_ends() : m.equipment_history_warranty_ended(),
			tone: upcoming ? "info" : "neutral",
			icon: "warranty",
		});
	}

	// The unit's orders the viewer reads (a customer's at their sites, an engineer's own).
	const orders = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			description: order.description,
			via: orderRequest.via,
			reported: sql<number>`${orderRequest.orderId} is not null`.mapWith(Boolean),
		})
		.from(order)
		.leftJoin(orderRequest, eq(orderRequest.orderId, order.id))
		.where(and(inTenant(order), onUnit(query.unit.id), await visibleOrNone("order")));
	const orderById = new Map(orders.map((each) => [String(each.id), each]));
	const orderIds = [...orderById.keys()];

	// A page's rows, and a few more, as steps close together become one entry.
	const fetch = limit * 2 + 4;
	const rows = await db
		.select()
		.from(activity)
		.where(
			and(
				inTenant(activity),
				before ? lte(activity.createdAt, before.at) : undefined,
				or(
					and(
						eq(activity.subjectType, "order"),
						inList(activity.subjectId, orderIds),
						inList(activity.action, orderActions),
					),
					and(
						eq(activity.subjectType, "order_photo"),
						eq(activity.action, "created"),
						eq(activity.parentType, "order"),
						inList(activity.parentId, orderIds),
					),
					and(
						eq(activity.subjectType, "equipment_document"),
						eq(activity.action, "created"),
						eq(activity.parentType, "equipment"),
						eq(activity.parentId, String(query.unit.id)),
					),
				),
			),
		)
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(fetch);
	const truncated = rows.length === fetch;

	// The engineers planned, by id, and the orders' photos the viewer sees.
	const engineerIds = rows
		.filter((row) => row.action === "scheduled")
		.map((row) => changedTo(row, "engineerId"))
		.filter((id): id is number => typeof id === "number");
	const [engineers, photos] = await Promise.all([
		engineerIds.length
			? db
					.select({ id: engineer.id, name: engineer.name })
					.from(engineer)
					.where(and(inTenant(engineer), inList(engineer.id, engineerIds)))
			: [],
		photosOf(orders.map((each) => each.id)),
	]);
	const engineerName = new Map(engineers.map((each) => [each.id, each.name]));
	const seenPhotos = new Set([...photos.values()].flat().map((photo) => photo.id));

	const entries = logEntries(rows.toReversed(), {
		asking,
		orderOf: (id) => orderById.get(id),
		engineerOf: (id) => (typeof id === "number" ? engineerName.get(id) : undefined),
		photosOf: (orderId) => orderPhotos(photos.get(orderId) ?? []),
		photoSeen: (id) => seenPhotos.has(id),
	});
	// Rows past the last fetched may belong with it: it's held to the rows before it.
	const oldest = rows.at(-1)?.createdAt;
	const complete =
		truncated && oldest
			? entries.filter((entry) => Temporal.Instant.compare(entry.at, oldest) > 0)
			: entries;
	const answer = answerOf([...own, ...complete], before, limit, truncated);
	return { ...answer, liveTypes: ["order", "equipment"] };
}

/** What `logEntries()` needs to know beside the rows. */
interface LogContext {
	asking: MemberViewer;
	orderOf: (id: string) =>
		| {
				id: number;
				number: string;
				type: OrderType;
				description: string;
				via: ReportChannel | null;
				reported: boolean;
		  }
		| undefined;
	engineerOf: (id: unknown) => string | undefined;
	photosOf: (orderId: number) => TimelinePhoto[];
	photoSeen: (id: number) => boolean;
}

/**
 * The log's rows (oldest first) as timeline entries: an order's steps close together as one
 * (accepted and planned; the photos of a report with the report), photos added together as one.
 */
export function logEntries(rows: readonly Row[], context: LogContext): TimelineEntry[] {
	const { asking } = context;
	const office = asking.audience === "office";
	const entries: TimelineEntry[] = [];
	/** The latest entry of each order, to fold a step close after it into it. */
	const latest = new Map<string, TimelineEntry>();
	const close = (entry: TimelineEntry | undefined, at: Temporal.Instant) =>
		entry && entry.at.until(at).total("seconds") <= TOGETHER_SECONDS;
	const by = (row: Row) => (row.userName ? nameFor(asking, row.userName) : null);

	for (const row of rows) {
		if (row.subjectType === "equipment_document") {
			entries.push({
				id: `log:${row.id}`,
				at: row.createdAt,
				kind: "unit.document",
				title: m.equipment_timeline_document({ title: row.subjectLabel }),
				tone: "neutral",
				icon: "document",
			});
			continue;
		}
		const orderId = row.subjectType === "order_photo" ? row.parentId! : row.subjectId;
		const found = context.orderOf(orderId);
		if (!found) continue;
		const previous = latest.get(orderId);
		const base = { at: row.createdAt, order: found.number };

		if (row.subjectType === "order_photo") {
			const photo = { id: Number(row.subjectId), src: `/photos/${row.subjectId}` };
			if (!context.photoSeen(photo.id)) continue;
			// With the report or the photos just before it.
			if (
				previous &&
				close(previous, row.createdAt) &&
				(previous.kind === "order.reported" || previous.kind === "order.photos")
			) {
				previous.photos = [...(previous.photos ?? []), photo];
				if (previous.kind === "order.photos") {
					previous.title = m.equipment_timeline_photos({ count: previous.photos.length });
				}
				continue;
			}
			const entry: TimelineEntry = {
				id: `log:${row.id}`,
				...base,
				kind: "order.photos",
				title: m.equipment_timeline_photos({ count: 1 }),
				photos: [photo],
				tone: "neutral",
				icon: "photo",
			};
			entries.push(entry);
			latest.set(orderId, entry);
			continue;
		}

		const status = row.action === "updated" ? statusSet(row) : null;
		let entry: TimelineEntry | null = null;
		switch (row.action) {
			case "created":
				entry = found.reported
					? {
							id: `log:${row.id}`,
							...base,
							kind: "order.reported",
							title:
								found.via === "qr"
									? m.equipment_timeline_reported_qr()
									: m.equipment_timeline_reported_portal(),
							detail: office ? withBy(found.description, by(row)) : found.description,
							tone: "warning",
							icon: "report",
						}
					: {
							id: `log:${row.id}`,
							...base,
							kind: "order.created",
							title: m.equipment_timeline_created({ type: label("orderType", found.type) }),
							detail: found.description,
							tone: "info",
							icon: "order",
						};
				break;
			case "accepted":
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.accepted",
					title: m.equipment_timeline_accepted(),
					tone: "info",
					icon: "order",
				};
				break;
			case "scheduled": {
				const name = context.engineerOf(changedTo(row, "engineerId"));
				const when = changedTo(row, "scheduledFor");
				const day = typeof when === "string" ? formatDateTime(Temporal.Instant.from(when)) : null;
				const detail = [name && nameFor(asking, name), day].filter(Boolean).join(" · ") || null;
				// Accepted and planned at once: "Order created, engineer scheduled".
				if (previous?.kind === "order.accepted" && close(previous, row.createdAt)) {
					Object.assign(previous, {
						kind: "order.planned",
						title: m.equipment_timeline_accepted_scheduled(),
						detail,
						icon: "scheduled",
					});
					continue;
				}
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.scheduled",
					title: m.equipment_timeline_scheduled(),
					detail,
					tone: "info",
					icon: "scheduled",
				};
				break;
			}
			case "departed":
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.departed",
					title: m.equipment_timeline_departed(),
					detail: by(row),
					tone: "info",
					icon: "on_the_way",
				};
				break;
			case "work_started":
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.started",
					title: m.equipment_timeline_started(),
					detail: by(row),
					tone: "info",
					icon: "started",
				};
				break;
			case "completed":
			case "updated": {
				if (row.action === "updated" && status === "cancelled") {
					entry = {
						id: `log:${row.id}`,
						...base,
						kind: "order.cancelled",
						title: m.equipment_timeline_cancelled(),
						tone: "neutral",
						icon: "cancelled",
					};
					break;
				}
				if (row.action === "updated" && status !== "completed") continue;
				const photos = context.photosOf(found.id);
				// The photos taken just before it are the completion's.
				if (
					previous?.kind === "order.photos" &&
					previous.at.until(row.createdAt).total("minutes") <= PHOTOS_BEFORE_MINUTES
				) {
					entries.splice(entries.indexOf(previous), 1);
				}
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.completed",
					title: photos.length
						? m.equipment_timeline_completed_photos({ count: photos.length })
						: m.equipment_timeline_completed(),
					detail: [found.description, by(row)].filter(Boolean).join(" · "),
					photos,
					tone: "success",
					icon: "completed",
				};
				break;
			}
			case "rejected":
				entry = {
					id: `log:${row.id}`,
					...base,
					kind: "order.rejected",
					title: m.equipment_timeline_rejected(),
					// The reason, written for the customer.
					detail: row.note,
					tone: "danger",
					icon: "cancelled",
				};
				break;
		}
		if (!entry) continue;
		entries.push(entry);
		latest.set(orderId, entry);
	}
	return entries;
}

/** A line with who did it, for the office. */
const withBy = (text: string, name: string | null) =>
	name ? m.equipment_timeline_by({ text, name }) : text;

/**
 * The unit `serialNumber` (or a 404, also for one the viewer may not read) as the timeline's points
 * are asked about it, with the viewer.
 */
async function timelineUnit(serialNumber: string) {
	const unit = await unitBySerial(serialNumber, {
		id: equipment.id,
		serialNumber: equipment.serialNumber,
		customerId: equipment.customerId,
		siteId: equipment.siteId,
		installedAt: equipment.installedAt,
		warrantyUntil: equipment.warrantyUntil,
	});
	await readOrNotFound({ type: "equipment", id: unit.id });
	const asking = await viewer();
	if (asking.audience === "system") throw new Error("The system has no unit timeline");
	const { installedAt, warrantyUntil, ...rest } = unit;
	return { unit: rest, dates: { installedAt, warrantyUntil }, asking };
}

/**
 * A page of the unit `serialNumber`'s timeline after `before` (none: the first, with today's
 * figures), as the request's viewer may see it: its entries, the next page's cursor, and the change
 * types its page refreshes on (besides the unit's).
 */
export async function unitTimeline(serialNumber: string, before: TimelineCursor | null) {
	const { unit, dates, asking } = await timelineUnit(serialNumber);
	const query: TimelineQuery = { unit, viewer: asking, before, limit: TIMELINE_PAGE };
	const now = Temporal.Now.instant();
	const [own, answers, today] = await Promise.all([
		coreEntries(query, dates),
		collect(timeline, query),
		before
			? null
			: collect(figures, { unit, viewer: asking, from: startOfDay(currentDay()), to: now }),
	]);
	const page = pageOf([own, ...answers], TIMELINE_PAGE);
	return {
		...page,
		/** The unit's id, which the page follows in its shell's feed. */
		unitId: unit.id,
		figures: today?.flat() ?? null,
		liveTypes: [...new Set([own, ...answers].flatMap((answer) => answer.liveTypes ?? []))],
		/** The user's today, for the page's day headings. */
		today: dayOf(now),
	};
}
