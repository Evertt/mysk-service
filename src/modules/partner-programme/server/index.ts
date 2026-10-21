import { accessRules } from "#lib/access/extensions.ts";
/**
 * The partner programme's contributions to the core's hooks (see `#lib/server/extensions.ts`): an
 * order's classification is saved with it from the order form (`orders.saving`), and the daily job
 * expires wallet credit past its date (`jobs.daily`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { saving } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

import { partnerAccess } from "./access.ts";
import { saveClassification } from "./classification.ts";
import { expireCredit } from "./wallet.ts";

export default defineServerModule("partner-programme", [
	contribute(accessRules, () => partnerAccess),
	contribute(saving, saveClassification),
	contribute(daily, expireCredit),
]);
