/**
 * The checklists module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). A module that only enhances checklists may import this file, and
 * gets what it needs from the slot's props: never from checklists' tables.
 */
import type { SQL } from "drizzle-orm";

import { defineCollector, defineSaveHook, defineSlot } from "#lib/extensions/define.ts";
import type { Transaction } from "#lib/server/db/index.ts";

import type { ChecklistKind, PointResult } from "../model.ts";

/**
 * The rule a checklist's score is worked out by (see `../model.ts`): the share of its points found
 * OK among those found OK or rejected, none when no point counts. Here for the modules that are told
 * a checklist is completed, which work it out over some of its points (the condition module, over
 * a component's own).
 */
export { checklistScore } from "../model.ts";

/**
 * A unit's inspection status today (`inspectionStatus()` in `../model.ts`): what the condition
 * module's status takes in, through `condition.signals`.
 */
export type { InspectionStatus } from "../model.ts";

/**
 * Below a unit's checklist on the engineer portal's page of one of their orders, e.g. the condition
 * module's question how the unit is doing once its checklist is completed. They get the order's
 * number, the unit's id, whether the checklist is completed and whether the engineer can still
 * change things (the order in progress), load their own data with their module's remote functions,
 * and render nothing when they have nothing to ask.
 */
export const fieldChecklist = defineSlot<{
	number: string;
	equipmentId: number;
	completed: boolean;
	canChange: boolean;
}>("checklists.field.checklist");

/** A rejected point of a checklist, with the template point it was copied from. */
export interface RejectedPoint {
	/** The template point's id; points whose template point is gone are left out. */
	templateItemId: number;
	text: string;
	/** The unit's title, e.g. "Sectionaaldeur dock 3". */
	unit: string;
	/**
	 * The article the point checks on that unit, if any (`checklists.pointArticles`, e.g. a
	 * component's): what's suggested first.
	 */
	materialId: number | null;
}

/**
 * Under the checklists' card on an order's page in the office, e.g. the parts shop's part a
 * rejected point needs ("Benodigd onderdeel"). They get the order's number and its checklists'
 * rejected points, and render nothing when they have nothing for them.
 */
export const orderRejected = defineSlot<{ number: string; rejected: RejectedPoint[] }>(
	"checklists.order.rejected",
);

/**
 * Under the checklists' results on an order's page in the customer portal, e.g. the parts shop's
 * way to order the part a rejected point needs ("Bestel in de shop"). Like `orderRejected`.
 */
export const clientRejected = defineSlot<{ number: string; rejected: RejectedPoint[] }>(
	"checklists.client.rejected",
);

/** A point of a completed checklist: the template point it was copied from, and what was found. */
interface CompletedPoint {
	/** None for a point copied before checklists kept it that no template point matched. */
	templateItemId: number | null;
	result: PointResult | null;
}

/** A checklist that's being completed, in the transaction that completes it. */
export interface ChecklistCompleting {
	tx: Transaction;
	checklist: {
		id: number;
		kind: ChecklistKind;
		orderId: number;
		equipmentId: number;
		/** The engineer who completes it; none when the office completes it on their behalf. */
		engineerId: number | null;
	};
	points: CompletedPoint[];
}

/**
 * When a checklist is completed ("na elke afgeronde werkbon"), by an engineer in the field or by the
 * office on their behalf, in its transaction: e.g. the
 * condition module records the unit's condition, its score worked out from the points
 * (`checklistScore()`), and its components'. A module that answers problems refuses the
 * completion, which rolls it back.
 */
export const checklistCompleted = defineSaveHook<ChecklistCompleting, { message: string }>(
	"checklists.completed",
);

/** A unit's checklist point, as asked about the articles it checks. */
export interface UnitPoint {
	equipmentId: number;
	templateItemId: number;
}

/** The article (a material) a point of a unit checks: e.g. that of a component of the unit's. */
export interface PointArticle extends UnitPoint {
	materialId: number;
}

/**
 * The articles the units' points check, e.g. the condition module's components': a rejected point
 * of a component whose article is in the shop suggests that article first. A module that fails is
 * left out.
 */
export const pointArticles = defineCollector<{ points: readonly UnitPoint[] }, PointArticle[]>(
	"checklists.pointArticles",
	{ onError: "skip" },
);

// --- Components, on the work orders page ------------------------------------------------------

/** A part of a unit whose condition is tracked, e.g. the condition module's component. */
export interface UnitComponent {
	id: number;
	equipmentId: number;
	/** E.g. `OC-1041`: what the page's URL names it by. */
	number: string;
	name: string;
	/** Its latest score (0–100), if it has one. */
	score: number | null;
	/** The template points that check it: the points of a checklist that are its. */
	templateItemIds: number[];
}

/**
 * The components of the units asked about, each unit's in their order: the work orders page lists
 * them under their unit and narrows a checklist to a component's points. The condition module
 * answers; without it, units have none. A module that fails is left out.
 */
export const unitComponents = defineCollector<{ equipmentIds: readonly number[] }, UnitComponent[]>(
	"checklists.components",
	{ onError: "skip" },
);

/** A score a component got, on its own history. */
export interface ComponentScore {
	id: number;
	score: number;
	at: Temporal.Instant;
	/** Its checklist's (completed on an order), or the office's correction. */
	source: "checklist" | "office";
	/** The order it was recorded on, if any. */
	order: string | null;
	/** Who recorded it. */
	by: string | null;
}

/**
 * The scores of the unit's component `componentId`, newest first (none for a component that isn't
 * the unit's). The condition module answers; a module that fails is left out.
 */
export const componentScores = defineCollector<
	{ equipmentId: number; componentId: number },
	ComponentScore[]
>("checklists.componentScores", { onError: "skip" });

/**
 * What the work orders page's search finds a unit by besides its own fields: its components'
 * numbers and names, as SQL text over the `equipment` row of the query it goes in (correlated on
 * `equipment.id` and its tenant), built per request. Asked at once, as the list's SQL is built; a
 * module that fails fails the list.
 */
export const componentSearch = defineCollector<void, SQL<string | null>>(
	"checklists.componentSearch",
	{ onError: "fail", now: true },
);
