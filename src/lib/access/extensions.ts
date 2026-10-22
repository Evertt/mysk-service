/**
 * Who may read or change a record (`#lib/server/access/`): each subject type has one entry, its
 * rules per audience. The core's are in `#lib/server/access/core.ts`; a module adds the rules of its
 * own subject types (and only those) in its `server/access.ts`, contributed in its `server/index.ts`:
 *
 * ```ts
 * contribute(accessRules, () => checklistAccess);
 * ```
 *
 * A module that's off adds none (the kernel asks only the modules that are on), so its types have
 * no rule and its records are not found.
 */
import { defineCollector } from "#lib/extensions/define.ts";
import type { AccessRule } from "#lib/server/access/rules.ts";

/** A module's rules, by the name of each of its subject types. */
export type AccessRules = Record<string, AccessRule>;

/**
 * The modules' access rules: each module that's on answers its rules, at once. A module whose
 * rules fail fails the request: an access check that is skipped would be a way in.
 */
export const accessRules = defineCollector<void, AccessRules>("access.rules", {
	onError: "fail",
	now: true,
});
