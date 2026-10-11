/**
 * The materials' part of the order form (`orders.form`): its lines, none when it has none. Submitted
 * under the form's `modules.materials`, validated with the form in the browser and on the server
 * (see `#lib/extensions/form-parts.ts`), and saved with the order (`saveOrderMaterials()`, through
 * `orders.saving`). Isomorphic.
 */
import * as v from "valibot";

import { orderLines } from "../form/order-lines-schema.ts";

export default v.object({ lines: orderLines() });
