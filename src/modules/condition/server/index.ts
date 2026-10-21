/**
 * The condition module's contributions to the core's hooks and to those of the modules it enhances
 * (see `#lib/server/extensions.ts`): its daily job, which plans the critical units for the tenants
 * that want it (`jobs.daily`, `automatic.ts`); and, with checklists on, the conditions a completed
 * checklist gives its unit and its components (`checklists.completed`, `conditions.ts`), the
 * articles of the components its points check (`checklists.pointArticles`, `components.ts`), and
 * the components on the work orders page, with their scores, their history and what its search
 * finds them by (`checklists.components`, `checklists.componentScores`,
 * `checklists.componentSearch`, `checklist-components.ts`). Its records' access rules are `access.ts`'s
 * (`access.rules`).
 */
import { accessRules } from "#lib/access/extensions.ts";
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import {
	checklistCompleted,
	componentScores,
	componentSearch,
	pointArticles,
	unitComponents,
} from "#modules/checklists/api/extensions.ts";

import { conditionAccess } from "./access.ts";
import { planCriticalUnits } from "./automatic.ts";
import {
	componentScoresOf,
	componentSearchText,
	componentsOfUnits,
} from "./checklist-components.ts";
import { componentArticles } from "./components.ts";
import { recordChecklistConditions } from "./conditions.ts";

export default defineServerModule("condition", [
	contribute(accessRules, () => conditionAccess),
	contribute(daily, planCriticalUnits),
	contribute(checklistCompleted, recordChecklistConditions),
	contribute(pointArticles, componentArticles),
	contribute(unitComponents, componentsOfUnits),
	contribute(componentScores, componentScoresOf),
	contribute(componentSearch, componentSearchText),
]);
