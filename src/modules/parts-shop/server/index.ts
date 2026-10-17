/**
 * The parts shop's contributions to the hooks of the modules it enhances (see
 * `#lib/server/extensions.ts`): with the condition module on, the points its products fix are what
 * a component with one of them as its article is checked by (`condition.articleCheckpoints`).
 */
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { articleCheckpoints } from "#modules/condition/api/extensions.ts";

import { articleCheckpointsOf } from "./articles.ts";

export default defineServerModule("parts-shop", [
	contribute(articleCheckpoints, articleCheckpointsOf),
]);
