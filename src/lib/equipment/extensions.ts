/** The equipment's extension points: where modules take part in its pages (see `#lib/extensions/define.ts`). */
import { defineRecordPoints, slotProps } from "#lib/extensions/define.ts";

/**
 * A unit's points: cards on its page (`detail`), packed in columns with its own (a masonry,
 * `#lib/components/masonry.ts`: each card is placed on its own, so a component may render
 * several), and columns in the equipment list (`list.columns`, see
 * `#lib/components/data-table/module-columns.ts`, e.g. maintenance's next due date: sorted and
 * filtered in the database like the list's own). The cards load their own data through their
 * module's remote functions, and render nothing when they have nothing to say.
 */
export const points = defineRecordPoints("equipment", {
	detail: slotProps<{ serialNumber: string }>(),
	listColumns: true,
});
