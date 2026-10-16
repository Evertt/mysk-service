/** The dashboard's extension points: where modules add to it (see `#lib/extensions/define.ts`). */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Stat cards in the dashboard's headline row, after its own (a `StatCard` each, e.g. how many
 * materials run low). The components load their own data through their module's remote functions.
 */
export const stats = defineSlot<Record<string, never>>("dashboard.stats");

/**
 * Cards on the dashboard, below the headline numbers, packed in columns with its own (a masonry:
 * each card is placed on its own, so a component may render several). A card that needs the room
 * (a chart, a wide table) says `data-wide` on its root and spans two columns where there are two.
 * The components load their own data through their module's remote functions.
 */
export const cards = defineSlot<Record<string, never>>("dashboard.cards");
