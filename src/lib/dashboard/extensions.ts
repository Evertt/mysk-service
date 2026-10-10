/** The dashboard's extension points: where modules add to it (see `#lib/extensions/define.ts`). */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards on the dashboard, below the headline numbers (laid out in two columns). The components
 * load their own data through their module's remote functions.
 */
export const cards = defineSlot<Record<string, never>>("dashboard.cards");
