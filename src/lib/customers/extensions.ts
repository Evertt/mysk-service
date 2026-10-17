/** The customers' extension points: where modules take part in their pages (see `#lib/extensions/define.ts`). */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards in the side column of a customer's page, e.g. the partner programme's level and wallet.
 * The components load their own data through their module's remote functions (by the customer's
 * code, checked in the tenant there), and render nothing when they have nothing to say.
 */
export const detailSide = defineSlot<{ code: string }>("customers.detail.side");
