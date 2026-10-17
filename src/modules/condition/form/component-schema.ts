/**
 * A unit's component as its dialog on the unit's page submits it: its name, its article (none for
 * none, or while the tenant hasn't materials) and the checklist points that check it; with its id
 * when it's changed, and the unit's serial number when it's added. Isomorphic: the browser and the
 * server check it the same way.
 */
import * as v from "valibot";

import { id, optionalId, text } from "#lib/schema.ts";

import { COMPONENT_NAME_MAX } from "../model.ts";

export const componentSchema = v.object({
	serialNumber: v.pipe(v.string(), v.nonEmpty()),
	/** Empty for a new component. */
	id: optionalId(),
	name: v.pipe(
		text(m.condition_component_name_required),
		v.maxLength(COMPONENT_NAME_MAX, (issue) =>
			m.condition_component_name_max({ max: issue.requirement }),
		),
	),
	materialId: v.optional(optionalId(), ""),
	checkpointIds: v.optional(v.pipe(v.array(id()), v.maxLength(200)), []),
});

/** A component that's removed. */
export const componentIdSchema = v.object({ id: id() });

/** A component moved one place up or down among its unit's. */
export const moveComponentSchema = v.object({ id: id(), direction: v.picklist(["up", "down"]) });
