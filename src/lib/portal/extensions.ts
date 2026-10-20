/**
 * The engineer portal's extension points: where modules add to its pages (see
 * `#lib/extensions/define.ts`). The portal is core for now; its points move to its module's
 * `api/extensions.ts` when it becomes one.
 */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards on an engineer's page of one of their orders, after its hours. The components load their
 * own data through their module's remote functions (made for engineers, `moduleRemote(id,
 * "engineer")`), which check it's the engineer's order, and what they may do with it
 * (`fieldActions()`). A card calls `changed()` when it changes what the order may do, e.g. once a
 * checklist is completed, so the page's forms drop a refusal that's outdated by it.
 */
export const order = defineSlot<{ number: string; id: number; changed: () => void }>(
	"portal.order",
);
