/**
 * The condition module's contributions to the core's hooks and to those of the modules it enhances
 * (see `#lib/server/extensions.ts`): its daily job, which plans the critical units for the tenants
 * that want it (`jobs.daily`, `automatic.ts`); its figures about customers' sites, for the sites
 * overview and the site report (`customers.siteSummary`, `site-summary.ts`); and, with checklists on, the conditions a completed
 * checklist gives its unit and its components (`checklists.completed`, `conditions.ts`), the
 * articles of the components its points check (`checklists.pointArticles`, `components.ts`), and
 * the components on the work orders page, with their scores, their history and what its search
 * finds them by (`checklists.components`, `checklists.componentScores`,
 * `checklists.componentSearch`, `checklist-components.ts`). Its records' access rules are `access.ts`'s
 * (`access.rules`). A unit's timeline shows its conditions measured and its figures its NEN 2767
 * score (`equipment.timeline`, `equipment.figures`, `timeline.ts`). Its defect photos' stored files
 * go when their unit is deleted (`equipment.removing`) and in the daily sweep (`jobs.fileSweeps`),
 * both `photos.ts`.
 */
import { accessRules } from "#lib/access/extensions.ts";
import { siteSummary } from "#lib/customers/extensions.ts";
import { figures, removingUnit, timeline } from "#lib/equipment/extensions.ts";
import { daily, fileSweeps } from "#lib/jobs/extensions.ts";
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
import { sweepConditionPhotos, unitPhotoFiles } from "./photos.ts";
import { conditionSiteSummary } from "./site-summary.ts";
import { conditionFigures, conditionTimeline } from "./timeline.ts";

export default defineServerModule("condition", [
	contribute(accessRules, () => conditionAccess),
	contribute(daily, planCriticalUnits),
	contribute(siteSummary, conditionSiteSummary),
	contribute(checklistCompleted, recordChecklistConditions),
	contribute(pointArticles, componentArticles),
	contribute(unitComponents, componentsOfUnits),
	contribute(componentScores, componentScoresOf),
	contribute(componentSearch, componentSearchText),
	contribute(timeline, conditionTimeline),
	contribute(figures, conditionFigures),
	contribute(removingUnit, unitPhotoFiles),
	contribute(fileSweeps, sweepConditionPhotos),
]);
