/**
 * The equipment's extension points: where modules take part in its pages (see
 * `#lib/extensions/define.ts`). Isomorphic, so the timeline's types are also the pages'.
 */
import { defineCollector, defineRecordPoints, slotProps } from "#lib/extensions/define.ts";
// Only the types: this file is isomorphic.
import type { MemberViewer } from "#lib/server/access/viewer.ts";
import type { Transaction } from "#lib/server/db/index.ts";

import type { TimelineAnswer, TimelineCursor, TimelineFigure } from "./timeline/timeline.ts";

/**
 * A unit's points: cards on its page (`detail`), packed in columns with its own (a masonry,
 * `#lib/components/masonry.ts`: each card is placed on its own, so a component may render
 * several), and columns in the equipment list (`list.columns`, see
 * `#lib/components/data-table/module-columns.ts`, e.g. maintenance's next due date: sorted and
 * filtered in the database like the list's own). The cards load their own data through their
 * module's remote functions, and render nothing when they have nothing to say.
 */
export const points = defineRecordPoints("equipment", {
	detail: slotProps<{ serialNumber: string }>(),
	listColumns: true,
});

/** The unit a module answers the timeline's points about: one the viewer may read. */
interface TimelineUnit {
	id: number;
	serialNumber: string;
	customerId: number;
	siteId: number;
}

/** What the timeline asks the modules: a page of a unit's timeline, as `viewer` may see it. */
export interface TimelineQuery {
	unit: TimelineUnit;
	/** Who is asking: each module answers only what the access registry lets them read. */
	viewer: MemberViewer;
	/** Answer the entries after this one (`isAfter()`); none: from the newest. */
	before: TimelineCursor | null;
	/** At most this many: the newest after `before` (`answerOf()` makes the answer). */
	limit: number;
}

/**
 * A unit's timeline (`#lib/equipment/timeline/`, on its page in all three shells): each module
 * answers its entries for a page of it, in the request's language and for the viewer, e.g. energy
 * its door's openings and alerts, condition its conditions measured. The core's own (its orders'
 * steps, reports, photos, documents) come from the activity log. A module that fails is left out:
 * the rest of the timeline still shows.
 */
export const timeline = defineCollector<TimelineQuery, TimelineAnswer>("equipment.timeline", {
	onError: "skip",
});

/** What the figures ask the modules: today's, from the start of the user's day until now. */
export interface FiguresQuery {
	unit: TimelineUnit;
	viewer: MemberViewer;
	from: Temporal.Instant;
	to: Temporal.Instant;
}

/**
 * The headline figures above a unit's timeline, of today: e.g. energy's times opened and energy
 * lost, condition's NEN 2767 score. A tenant without the module has none of its figures.
 */
export const figures = defineCollector<FiguresQuery, TimelineFigure[]>("equipment.figures", {
	onError: "skip",
});

/** Core is about to delete one of the tenant's units, in `tx`. */
export interface UnitRemoval {
	/** The transaction core deletes the unit in: a module reads what it has of the unit in it. */
	tx: Transaction;
	unitId: number;
}

/**
 * What a module lets go of when one of the tenant's units is deleted (`UnitRemoval`): its rows
 * about the unit go with it (the keys cascade), and it answers, in the deletion's transaction
 * before the delete, what lets go of what they held outside the database (e.g. condition's defect
 * photos' stored files), which core runs once that has committed (`removeEquipment()`). The modules
 * the tenant has switched off are asked too, since their rows go just the same.
 */
export const removingUnit = defineCollector<UnitRemoval, () => Promise<void>>(
	"equipment.removing",
	{ onError: "fail", alsoOff: true },
);
