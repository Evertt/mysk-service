/**
 * The checklists module's contributions to core's orders (see `#lib/server/extensions.ts`): an
 * inspection or maintenance order's units get their checklists as the order gets them, and lose
 * them only while nothing's answered, and the drafts follow the order's type (`orders.units`); an
 * order isn't deleted once one is on record, nor completed while one is open (`orders.saving`). With the condition module
 * on, a unit's inspection status goes into its condition status (`condition.signals`), and a unit's template's
 * points are what its components can be checked by (`condition.checkpoints`). With the parts shop
 * on, its products are linked to the templates' points (`parts-shop.checkpoints`). A checklist
 * completed with rejected points rings the office's bell (`notifications.rules`).
 */
import { notificationRules } from "#lib/notifications/extensions.ts";
import { saving, units } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import {
	checkpoints as componentCheckpoints,
	unitSignals,
} from "#modules/condition/api/extensions.ts";
import { checkpoints } from "#modules/parts-shop/api/extensions.ts";

import { saveOrderChecklists, saveUnitChecklists } from "./checklists.ts";
import { inspectionSignal } from "./inspection-sql.ts";
import { checklistNotificationRules } from "./notifications.ts";
import { shopCheckpoints, unitCheckpoints } from "./shop.ts";

export default defineServerModule("checklists", [
	contribute(units, saveUnitChecklists),
	contribute(saving, saveOrderChecklists),
	contribute(unitSignals, inspectionSignal),
	contribute(checkpoints, shopCheckpoints),
	contribute(componentCheckpoints, unitCheckpoints),
	contribute(notificationRules, checklistNotificationRules),
]);
