/**
 * The materials module's contributions to core's orders (see `#lib/server/extensions.ts`): an
 * order's materials are a cost in its price (`orders.costs`), and its lines and the stock that
 * follows its status are saved with it (`orders.saving`).
 */
import { materialCosts, saveOrderMaterials } from "#lib/materials/server/index.ts";
import { costs, saving } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

export default defineServerModule("materials", [
	contribute(costs, materialCosts),
	contribute(saving, saveOrderMaterials),
]);
