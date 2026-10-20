/**
 * The materials module's contributions to core's orders (see `#lib/server/extensions.ts`): an
 * order's materials are a cost in its price (`orders.costs`), its lines and the stock that follows
 * its status are saved with it (`orders.saving`). With the condition module on, its materials are the
 * articles of the units' components (`condition.articles`).
 */
import { costs, saving } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { articles } from "#modules/condition/api/extensions.ts";

import { materialArticles } from "./articles.ts";
import { materialCosts } from "./costs.ts";
import { saveOrderMaterials } from "./lines.ts";

export default defineServerModule("materials", [
	contribute(costs, materialCosts),
	contribute(saving, saveOrderMaterials),
	contribute(articles, materialArticles),
]);
