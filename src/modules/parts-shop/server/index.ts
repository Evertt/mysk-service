/**
 * The parts shop's contributions to the hooks of the modules it enhances (see
 * `#lib/server/extensions.ts`): with the condition module on, the points its products fix are what
 * a component with one of them as its article is checked by (`condition.articleCheckpoints`). An
 * order a customer places rings the office's bell (`notifications.rules`, a core point).
 */
import { accessRules } from "#lib/access/extensions.ts";
import { notificationRules } from "#lib/notifications/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { articleCheckpoints } from "#modules/condition/api/extensions.ts";

import { shopAccess } from "./access.ts";
import { articleCheckpointsOf } from "./articles.ts";
import { shopNotificationRules } from "./notifications.ts";

export default defineServerModule("parts-shop", [
	contribute(accessRules, () => shopAccess),
	contribute(articleCheckpoints, articleCheckpointsOf),
	contribute(notificationRules, shopNotificationRules),
]);
