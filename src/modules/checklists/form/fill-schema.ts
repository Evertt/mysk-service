/**
 * What filling a checklist in takes, in the engineer portal and on the office's work orders page
 * alike: a point's result, a point's remark, the general remark for the customer, and the
 * checklist to complete, each by its id.
 */
import * as v from "valibot";

import { recordId, textMax } from "#lib/schema.ts";

import { pointResults, textLimits } from "../model.ts";

const remark = (max: number) => v.pipe(v.string(), v.trim(), textMax(max));

/** A point's result (or none, to take it back). */
export const answerSchema = v.object({
	id: recordId(),
	result: v.nullable(v.picklist(pointResults)),
});

/** What's wrong with a point (or what part it needs), as the remark a rejection needs. */
export const pointRemarkSchema = v.object({ id: recordId(), remark: remark(textLimits.remark) });

/** The general remark and advice for the customer on a checklist. */
export const remarksSchema = v.object({ id: recordId(), remarks: remark(textLimits.remarks) });

/** A checklist, to complete. */
export const checklistIdSchema = v.object({ id: recordId() });
