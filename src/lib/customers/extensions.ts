/** The customers' extension points: where modules take part in their pages (see `#lib/extensions/define.ts`). */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards in the side column of a customer's page, e.g. the partner programme's level and wallet.
 * The components load their own data through their module's remote functions (by the customer's
 * code, checked in the tenant there), and render nothing when they have nothing to say.
 */
export const detailSide = defineSlot<{ code: string }>("customers.detail.side");

/**
 * Cards in the main column of a customer's page, below its recent activity, e.g. the service
 * history of its units. Like the side column's: by the customer's code, loading their own data.
 */
export const detailMain = defineSlot<{ code: string }>("customers.detail.main");
