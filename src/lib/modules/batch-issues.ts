/**
 * What's wrong with a batch an integration feed was posted (`jsonIngest()`,
 * `#lib/server/modules/integrations.ts`, answers them as an `InvalidBatch`'s `issues`): the same
 * shape for every module's feed. Not server-only: a feed's format checks it wherever it's parsed.
 */
import * as v from "valibot";

/** A problem with the batch, at a dotted `path` like `readings.3.start` (empty for the whole batch). */
export interface BatchIssue {
	path: string;
	message: string;
}

/** A schema's issues as the batch's. */
export const batchIssues = (issues: readonly v.BaseIssue<unknown>[]): BatchIssue[] =>
	issues.map((issue) => ({ path: v.getDotPath(issue) ?? "", message: issue.message }));
