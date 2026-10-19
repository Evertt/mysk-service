/** The equipment's extension points: where modules take part in its pages (see `#lib/extensions/define.ts`). */
import { defineListColumns, defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards on a unit of equipment's page, after its own and before its activity, packed in columns
 * with them (a masonry, `#lib/components/masonry.ts`: each card is placed on its own, so a
 * component may render several; the point keeps its name from when they were a side column). The
 * components load their own data through their module's remote functions, and render nothing when
 * they have nothing to say.
 */
export const detailSide = defineSlot<{ serialNumber: string }>("equipment.detail.side");

/**
 * Columns modules add to the equipment list (see `#lib/components/data-table/module-columns.ts`),
 * e.g. maintenance's next due date: sorted and filtered in the database like the list's own.
 */
export const listColumns = defineListColumns("equipment.list");
