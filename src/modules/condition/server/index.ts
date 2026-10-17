/**
 * The condition module's contributions to the core's hooks and to those of the modules it enhances
 * (see `#lib/server/extensions.ts`): its daily job, which plans the critical units for the tenants
 * that want it (`jobs.daily`, `automatic.ts`); and, with checklists on, the conditions a completed
 * checklist gives its unit and its components (`checklists.completed`, `conditions.ts`) and the
 * articles of the components its points check (`checklists.pointArticles`, `components.ts`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { checklistCompleted, pointArticles } from "#modules/checklists/api/extensions.ts";

import { planCriticalUnits } from "./automatic.ts";
import { componentArticles } from "./components.ts";
import { recordChecklistConditions } from "./conditions.ts";

export default defineServerModule("condition", [
	contribute(daily, planCriticalUnits),
	contribute(checklistCompleted, recordChecklistConditions),
	contribute(pointArticles, componentArticles),
]);
