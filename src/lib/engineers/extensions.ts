/** The engineers' extension points: where modules take part in their pages (see `#lib/extensions/define.ts`). */
import { defineRecordPoints, slotProps } from "#lib/extensions/define.ts";

/**
 * An engineer's points: cards in the columns of their page. The components load their own data
 * through their module's remote functions, and render nothing when they have nothing to say.
 */
export const points = defineRecordPoints("engineers", { detail: slotProps<{ id: number }>() });
