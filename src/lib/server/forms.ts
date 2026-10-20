import { formPartKey } from "#lib/extensions/form-part-key.ts";
import { partsOfModulesOff } from "#lib/extensions/form-parts.ts";
import { modules } from "#lib/modules/manifests.ts";

import { currentTenant } from "./auth/session.ts";
import { Refused } from "./refused.ts";

/**
 * Refuses a form that submitted a part of a module the tenant doesn't have (`parts`, the form's
 * `modules` field, see `#lib/extensions/form-parts.ts`): only a page loaded before the module was
 * switched off, or a tampered submission, sends one. Call it in the form's handler before saving.
 */
export function refuseOffParts(parts: Readonly<Record<string, unknown>>) {
	const off = partsOfModulesOff(parts, currentTenant().modules);
	if (!off.length) return;
	const label = (key: string) =>
		modules.find((module) => formPartKey(module.id) === key)?.label ?? key;
	throw new Refused(...off.map((id) => m.common_error_module_off({ module: label(id) })));
}
