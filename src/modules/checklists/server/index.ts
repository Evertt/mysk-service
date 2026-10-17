/**
 * The checklists module's contributions to core's orders (see `#lib/server/extensions.ts`): an
 * inspection or maintenance order's units get their checklists as the order gets them, and lose
 * them only while nothing's answered, and the drafts follow the order's type (`orders.units`); an
 * order isn't deleted once one is on record, nor completed while one is open (`orders.saving`); and
 * the cards that show them follow a saved order (`orders.committed`). With the condition module
 * on, a unit's inspection status goes into its condition status (`condition.signals`) and its
 * completed checklists into the service history (`condition.history`). With the parts shop on, its
 * products are linked to the templates' points (`parts-shop.checkpoints`).
 */
import { isFieldEngineer } from "#lib/auth/index.ts";
import { committed, saving, units } from "#lib/orders/extensions.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { history, unitSignals } from "#modules/condition/api/extensions.ts";
import { checkpoints } from "#modules/parts-shop/api/extensions.ts";

import { getOrderChecklists } from "../checklists.remote.ts";
import { getFieldChecklists } from "../portal/field-checklists.remote.ts";
import { saveOrderChecklists, saveUnitChecklists } from "./checklists.ts";
import { checklistHistory, inspectionSignal } from "./history.ts";
import { shopCheckpoints } from "./shop.ts";

export default defineServerModule("checklists", [
	contribute(units, saveUnitChecklists),
	contribute(saving, saveOrderChecklists),
	// The card of whoever saved it: the engineer's in the portal, the office's on the order's page.
	contribute(committed, ({ number }) => {
		if (isFieldEngineer(currentTenant().roles)) void getFieldChecklists(number).refresh();
		else void getOrderChecklists(number).refresh();
	}),
	contribute(unitSignals, inspectionSignal),
	contribute(history, checklistHistory),
	contribute(checkpoints, shopCheckpoints),
]);
