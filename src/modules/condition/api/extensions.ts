/**
 * The condition module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`): what they know about a unit that its status and service history
 * take in. Checklists answers with the unit's inspection status (and its column in the list),
 * maintenance with its next visit; without them, the condition module goes without.
 */
import type { SQL } from "drizzle-orm";

import { defineCollector, defineListColumns } from "#lib/extensions/define.ts";
import type { db, Transaction } from "#lib/server/db/index.ts";

import { REJECTED_POINT_GRADE } from "../model.ts";
import { elementScoreOf } from "../nen2767.ts";

/**
 * A score with its name, as the condition module shows it ("3 · Redelijk"): for the checklists
 * module's work orders page, which shows its components' scores.
 */
export { scoreText } from "../display.ts";

/**
 * The score a checklist's points give a unit or component when the office fills it in (its rejected
 * points without a grade of their own, `REJECTED_POINT_GRADE`, added up by NEN 2767-1's method):
 * 1 without a rejected point, none while no point counts (all not applicable or unanswered). For the
 * checklists module's work orders page, as the office fills a checklist in. Isomorphic.
 */
export function pointsScore(results: readonly { result: string | null }[]): number | null {
	if (!results.some((each) => each.result === "ok" || each.result === "nok")) return null;
	return elementScoreOf(
		results.filter((each) => each.result === "nok").map(() => REJECTED_POINT_GRADE),
	);
}

/** Which point of a checklist the signed-in engineer is filling in, asked about in `tx`. */
export interface FieldPointQuery {
	tx: Transaction | typeof db;
	/** The engineer's order, by number. */
	number: string;
	/** The unit whose checklist it is. */
	equipmentId: number;
	/** The point, by its own id (`checklists.field.rejected`'s `pointId`). */
	pointId: number;
}

/** A point of the engineer's checklist, as its defect is about it. */
export interface FieldPoint {
	id: number;
	text: string;
	result: "ok" | "nok" | "na" | null;
	/** Whether they can still change it: the checklist a draft, its order in progress. */
	canChange: boolean;
}

/**
 * The point asked about, when it's a point of the checklist of that unit on the signed-in engineer's
 * own order (none otherwise: another engineer's, unit's, order's or tenant's): what the condition
 * module checks before it keeps or shows a rejected point's defect. The checklists module answers,
 * as the owner of the points; without it there are none. A module that fails fails the request.
 */
export const fieldPoints = defineCollector<FieldPointQuery, FieldPoint | undefined>(
	"condition.fieldPoints",
	{ onError: "fail" },
);

/**
 * What a module knows of a unit, as SQL over the `equipment` row of the query it goes in
 * (correlated on `equipment.id`), scoped to the tenant and built per request. A module answers
 * with the parts it knows.
 */
export interface UnitSignals {
	/**
	 * The unit's inspection status today: `valid`, `expiring`, `expired`, `rejected` (its latest
	 * inspection rejected a point) or `none` (checklists' `InspectionStatus`), for its status.
	 */
	inspection?: SQL<string>;
	/** The day its next maintenance visit is due (`yyyy-mm-dd`), or null. */
	nextDue?: SQL<string | null>;
}

/**
 * The SQL of what the modules know of a unit: asked at once (an immediate collector), since the
 * equipment list's columns are built while its query is. A module that fails fails the list.
 */
export const unitSignals = defineCollector<void, UnitSignals>("condition.signals", {
	onError: "fail",
	now: true,
});

/**
 * Columns in the Connect page's list (`../list/units-list.ts`), like those of the equipment list:
 * checklists' inspection status.
 */
export const listColumns = defineListColumns("condition.list.columns");

/** An article a component can be linked to: one of the tenant's materials. */
export interface Article {
	/** The material's id, which a component keeps. */
	id: number;
	sku: string;
	name: string;
}

/**
 * Which articles: those with `ids` (to show components'), or the first `limit` whose SKU or name
 * has every word of `search` (any, for an empty one), to choose from in the component dialog.
 */
export type ArticleQuery = { ids: readonly number[] } | { search: string; limit: number };

/**
 * The tenant's articles asked for (`ArticleQuery`), by SKU. The materials module answers; without
 * it, there are none, and components have no article. A module that fails is left out.
 */
export const articles = defineCollector<ArticleQuery, Article[]>("condition.articles", {
	onError: "skip",
});

/** The checklist points an article fixes in the shop: its product's. */
export interface ArticleCheckpoints {
	materialId: number;
	templateItemIds: number[];
}

/**
 * The checklist points the articles asked about fix (the parts shop's products' points): what a
 * component linked to one is checked by, unless it's told otherwise. The parts shop answers;
 * without it, none. A module that fails is left out.
 */
export const articleCheckpoints = defineCollector<
	{ materialIds: readonly number[] },
	ArticleCheckpoints[]
>("condition.articleCheckpoints", { onError: "skip" });

/** A checklist point that can check a component: a point of one of the tenant's templates. */
export interface Checkpoint {
	/** The template point's id, which a component keeps. */
	id: number;
	/** Its template's name, e.g. "Sectionaaldeur". */
	template: string;
	/** Its group, e.g. "Mechanisch"; empty outside one. */
	group: string;
	text: string;
}

/**
 * The checklist points a unit's components can be checked by: those of the template its checklists
 * are made with, and those with the ids asked for (a component's, also of a retired template), in
 * the templates' order. The checklists module answers; without it, there are none. A module that
 * fails is left out.
 */
export const checkpoints = defineCollector<
	{ equipmentId: number; ids: readonly number[] },
	Checkpoint[]
>("condition.checkpoints", { onError: "skip" });
