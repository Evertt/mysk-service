/** The equipment's extension points: where modules take part in its pages (see `#lib/extensions/define.ts`). */
import { defineListColumns, defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards in the side column of a unit of equipment's page. The components load their own data
 * through their module's remote functions, and render nothing when they have nothing to say.
 */
export const detailSide = defineSlot<{ serialNumber: string }>("equipment.detail.side");

/**
 * Columns modules add to the equipment list (see `#lib/components/data-table/module-columns.ts`),
 * e.g. maintenance's next due date: sorted and filtered in the database like the list's own.
 */
export const listColumns = defineListColumns("equipment.list");
