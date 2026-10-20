/**
 * The checklists module's domain rules: a template's limits, and the order of its points, whose
 * groups are just a text on each point; and the checklists on orders: which orders have them, when
 * one can be completed, and a unit's inspection status. Pure and isomorphic.
 *
 * A template's points are in one order (`position`), with each group's points together: the groups
 * come in the order of their first point, and the points of a group in their own order. Moving a
 * point past the edge of its group takes it into the next group; changing its group puts it last
 * in the other.
 */
import { isOpenOrder, type OrderStatus, type OrderType } from "#lib/models.ts";
import { moved } from "#lib/ordering.ts";
import type { MoveDirection } from "#lib/schema.ts";

/** How many months an inspection by a template stays valid, unless the template says otherwise. */
export const defaultValidityMonths = 12;

/** How many months a template may say an inspection stays valid. */
export const validityLimits = { min: 1, max: 120 } as const;

/**
 * The most a template's name, its norm, a group and a point's text may have; and a checklist's
 * remarks: a point's and the general one for the customer.
 */
export const textLimits = {
	name: 80,
	norm: 80,
	group: 60,
	text: 240,
	remark: 500,
	remarks: 2000,
} as const;

/** A point as far as its order goes. */
export interface PointPlace {
	id: number;
	group: string;
	position: number;
}

/**
 * The points in their order, each group's together: groups in the order of their first point
 * (by `position`, then id), points within a group by the same.
 */
export function orderPoints<Point extends PointPlace>(points: readonly Point[]): Point[] {
	const sorted = points.toSorted((a, b) => a.position - b.position || a.id - b.id);
	return [...Map.groupBy(sorted, (point) => point.group).values()].flat();
}

/** The points under their groups' headings, in order (see `orderPoints()`). */
export function groupPoints<Point extends PointPlace>(points: readonly Point[]) {
	const groups = Map.groupBy(orderPoints(points), (point) => point.group);
	return [...groups].map(([group, items]) => ({ group, points: items }));
}

/** The order of points as their ids and groups, first to last: what `changedPlaces()` compares. */
type Order = { id: number; group: string }[];

const asOrder = (points: readonly PointPlace[]): Order =>
	orderPoints(points).map(({ id, group }) => ({ id, group }));

/**
 * The order with the point `id` moved one place `direction`: past its neighbour in its group, or,
 * at its group's edge, into the group before (as its last) or after (as its first). Unchanged for
 * the very first point up, the very last down, or an id that isn't among them.
 */
export function movePoint(points: readonly PointPlace[], id: number, direction: MoveDirection) {
	const order = asOrder(points);
	const at = order.findIndex((point) => point.id === id);
	if (at < 0) return order;
	const point = order[at];
	const next = order[direction === "up" ? at - 1 : at + 1];
	if (!next) return order;
	if (next.group !== point.group) {
		// At its group's edge: it joins the neighbouring group, where it stands.
		order[at] = { ...point, group: next.group };
		return order;
	}
	const to = direction === "up" ? at - 1 : at + 1;
	[order[at], order[to]] = [order[to], order[at]];
	return order;
}

/**
 * The order with the group `group` moved one place `direction`, past the group before or after
 * it. Unchanged for the first group up, the last down, or a group that isn't among them.
 */
export function moveGroup(points: readonly PointPlace[], group: string, direction: MoveDirection) {
	const groups = [...Map.groupBy(asOrder(points), (point) => point.group).values()];
	const at = groups.findIndex(([first]) => first.group === group);
	return moved(groups, at, direction).flat();
}

/**
 * The order with the point `id` in `group`: where it is when that's its group already, else last
 * in that group, or in a new group at the end. A point that isn't among them is added so (a new
 * point, with an id of its own).
 */
export function placePoint(points: readonly PointPlace[], id: number, group: string): Order {
	const order = asOrder(points);
	const current = order.find((point) => point.id === id);
	if (current?.group === group) return order;
	const rest = order.filter((point) => point.id !== id);
	const last = rest.findLastIndex((point) => point.group === group);
	const at = last < 0 ? rest.length : last + 1;
	return [...rest.slice(0, at), { id, group }, ...rest.slice(at)];
}

/**
 * The points whose group or position `order` changes, with their new ones: positions from 0, in
 * the order's order. Points the order leaves out keep theirs.
 */
export function changedPlaces(points: readonly PointPlace[], order: Order): PointPlace[] {
	const byId = new Map(points.map((point) => [point.id, point]));
	return order
		.map(({ id, group }, position) => ({ id, group, position }))
		.filter((place) => {
			const was = byId.get(place.id);
			return !was || was.group !== place.group || was.position !== place.position;
		});
}

// --- Checklists on orders --------------------------------------------------------------------

/**
 * What a checklist on an order is: an inspection (keuring), which makes a unit's inspection valid
 * for its template's months, or a maintenance visit (onderhoud). As the order's type.
 * @labels checklistKind
 */
export const checklistKinds = ["inspection", "maintenance"] as const;
export type ChecklistKind = (typeof checklistKinds)[number];

/** A draft is being filled in; a completed one is on record and isn't changed again. */
export const checklistStatuses = ["draft", "completed"] as const;
export type ChecklistStatus = (typeof checklistStatuses)[number];

/**
 * What the engineer found on a point: OK (Goed), rejected (Afkeur) or not applicable (N.v.t.).
 * @labels pointResult
 */
export const pointResults = ["ok", "nok", "na"] as const;
export type PointResult = (typeof pointResults)[number];

/** The kind of checklist each unit of an order of `type` gets; none for other types. */
export function checklistKind(type: OrderType): ChecklistKind | null {
	return (checklistKinds as readonly string[]).includes(type) ? (type as ChecklistKind) : null;
}

/**
 * Whether an order with `status` gets checklists for its units: while it's to be done. A done or
 * cancelled order gets none (one completed before the module was on keeps having none).
 */
export const getsChecklists = (status: OrderStatus) => isOpenOrder(status);

/** A point's answer as far as completing goes. */
export interface Answer {
	result: PointResult | null;
	remark: string | null;
}

/** Whether a point is answered as it must be: a result, and with a rejection, what's wrong. */
export const isAnswered = ({ result, remark }: Answer) =>
	result !== null && (result !== "nok" || !!remark?.trim());

/**
 * What keeps a checklist from being completed: points without a result, and rejections that don't
 * say what's wrong (the remark is required with Afkeur). Both 0: it can be completed.
 */
export function completionProblems(answers: readonly Answer[]) {
	return {
		unanswered: answers.filter((answer) => answer.result === null).length,
		unexplained: answers.filter((answer) => answer.result === "nok" && !answer.remark?.trim())
			.length,
	};
}

/** Whether a checklist with these answers can be completed (see `completionProblems()`). */
export const canComplete = (answers: readonly Answer[]) =>
	answers.length > 0 && answers.every(isAnswered);

/** How many of the points have a result, of how many: the progress "answered/total". */
export const progress = (answers: readonly Answer[]) => ({
	answered: answers.filter((answer) => answer.result !== null).length,
	total: answers.length,
});

/** How many points were rejected. */
export const rejections = (answers: readonly { result: PointResult | null }[]) =>
	answers.filter((answer) => answer.result === "nok").length;

/**
 * A checklist's score, in whole percents: the share of its points found OK among those found OK or
 * rejected ("passed 4 points and failed 6: 40%"). Not applicable and unanswered points don't count;
 * none when no point does. The condition module records it as the unit's condition when the
 * checklist is completed, and the same over a component's own points as the component's.
 */
export function checklistScore(answers: readonly { result: PointResult | null }[]): number | null {
	const ok = answers.filter((answer) => answer.result === "ok").length;
	const counted = ok + rejections(answers);
	return counted ? Math.round((100 * ok) / counted) : null;
}

/** The points with the rejected ones first, each in its own order otherwise. */
export const rejectedFirst = <Point extends { result: PointResult | null }>(
	points: readonly Point[],
) => [
	...points.filter((point) => point.result === "nok"),
	...points.filter((point) => point.result !== "nok"),
];

// --- A unit's inspection status (derived, never stored) -----------------------------------------

/**
 * Where a unit stands with its inspections, by its latest completed inspection: `valid` until its
 * validity runs out, `expiring` in the last 30 days of it, `expired` after; `rejected` when that
 * inspection rejected a point (unless it has expired, which is worse); `none` without one.
 * @labels inspectionStatus
 */
export const inspectionStatuses = ["valid", "expiring", "expired", "rejected", "none"] as const;
export type InspectionStatus = (typeof inspectionStatuses)[number];

/** How many days before its end a valid inspection counts as expiring. */
export const EXPIRING_DAYS = 30;

/**
 * The last day an inspection completed on `completedOn` is valid, by a template valid for
 * `months`: the same day that many months on (the month's last day, in a shorter month).
 */
export const validUntil = (completedOn: Temporal.PlainDate, months: number) =>
	completedOn.add({ months });

/** The unit's latest completed inspection, as its status goes by it. */
export interface LatestInspection {
	validUntil: Temporal.PlainDate;
	/** Whether it rejected a point. */
	rejected: boolean;
}

/** A unit's inspection status `today`, by its latest completed inspection (none: `none`). */
export function inspectionStatus(
	latest: LatestInspection | null,
	today: Temporal.PlainDate,
): InspectionStatus {
	if (!latest) return "none";
	if (Temporal.PlainDate.compare(today, latest.validUntil) > 0) return "expired";
	if (latest.rejected) return "rejected";
	const expiring = latest.validUntil.subtract({ days: EXPIRING_DAYS });
	return Temporal.PlainDate.compare(today, expiring) >= 0 ? "expiring" : "valid";
}

// --- The work orders page: a unit's checklist of this year ------------------------------------

/**
 * Where a unit stands this year ("2026 ✓", "2026 open"): `done` once a checklist of it was
 * completed this year, else `open` while a draft of it is on an open order, else `none` (worked out
 * in SQL, `yearStateSql()` in `server/assets.ts`).
 * @labels yearState
 */
export const yearStates = ["done", "open", "none"] as const;
export type YearState = (typeof yearStates)[number];

/**
 * A year's first and last moment (exclusive) in `timeZone`: what "completed this year" counts
 * between.
 */
export function yearBounds(year: number, timeZone: string) {
	const start = Temporal.PlainDate.from({ year, month: 1, day: 1 });
	return {
		start: start.toZonedDateTime(timeZone).toInstant(),
		end: start.add({ years: 1 }).toZonedDateTime(timeZone).toInstant(),
	};
}

/** A unit's checklist as the work orders page picks the one it shows. */
export interface YearChecklist {
	id: number;
	status: ChecklistStatus;
	/** Whether its order is still open (see `isOpenOrder()`): a draft can be filled in then. */
	open: boolean;
	/** The year it was completed in, in the user's time zone; none for a draft. */
	completedYear: number | null;
}

/**
 * The checklist of a unit that the work orders page shows for `year`, of its checklists newest
 * first: the one asked for (`wanted`, e.g. from its history) if it's the unit's; else its newest
 * draft on an open order; else the newest completed this year; else none (the page offers to start
 * one).
 */
export function shownChecklist<Checklist extends YearChecklist>(
	checklists: readonly Checklist[],
	year: number,
	wanted?: number,
): Checklist | null {
	return (
		checklists.find((checklist) => checklist.id === wanted) ??
		checklists.find((checklist) => checklist.status === "draft" && checklist.open) ??
		checklists.find(
			(checklist) => checklist.status === "completed" && checklist.completedYear === year,
		) ??
		null
	);
}

/**
 * A checklist's points narrowed to a component's (those copied from the template points that check
 * it), in their order, and how many of the others there are, which the page hides.
 */
export function componentPoints<Point extends { templateItemId: number | null }>(
	points: readonly Point[],
	templateItemIds: readonly number[],
) {
	const own = points.filter(
		(point) => point.templateItemId !== null && templateItemIds.includes(point.templateItemId),
	);
	return { points: own, others: points.length - own.length };
}
