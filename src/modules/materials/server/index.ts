/**
 * The materials module's contributions to core's orders (see `#lib/server/extensions.ts`): an
 * order's materials are a cost in its price (`orders.costs`), its lines and the stock that follows
 * its status are saved with it (`orders.saving`), and the engineer portal's card follows a change an
 * engineer made to it (`orders.committed`). With the condition module on, its materials are the
 * articles of the units' components (`condition.articles`).
 */
import { isFieldEngineer } from "#lib/auth/index.ts";
import { committed, costs, saving } from "#lib/orders/extensions.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { articles } from "#modules/condition/api/extensions.ts";

import { getFieldMaterials } from "../portal/field-materials.remote.ts";
import { materialArticles } from "./articles.ts";
import { materialCosts } from "./costs.ts";
import { saveOrderMaterials } from "./lines.ts";

export default defineServerModule("materials", [
	contribute(costs, materialCosts),
	contribute(saving, saveOrderMaterials),
	// Only an engineer's own change: the card's query is the engineer's (the office has no card).
	contribute(committed, ({ number }) => {
		if (isFieldEngineer(currentTenant().roles)) void getFieldMaterials(number).refresh();
	}),
	contribute(articles, materialArticles),
]);
