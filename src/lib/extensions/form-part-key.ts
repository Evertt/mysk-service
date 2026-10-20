import { camelCase } from "#lib/camel-case.ts";

/**
 * The key a module's part of a form is under, in the form's `modules` field (see `./form-parts.ts`):
 * its id in camel case, `partner-programme` → `partnerProgramme`, as SvelteKit writes form fields'
 * names in JS object notation and refuses keys that would need quoting. An id without a hyphen is its
 * own key (`materials`). Plain TypeScript, for the module generator (`scripts/modules/`) too.
 */
export const formPartKey = (moduleId: string) => camelCase(moduleId);
