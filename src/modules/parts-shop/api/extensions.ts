/**
 * The parts shop's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). A module that enhances the shop may import this file.
 */
import { defineCollector } from "#lib/extensions/define.ts";

/** A checklist point a product can fix: a point of one of the tenant's templates. */
export interface Checkpoint {
	/** The template point's id, which the shop links its products to. */
	id: number;
	/** Its template's name, e.g. "Sectionaaldeur". */
	template: string;
	/** Its group in the template, e.g. "Mechanisch"; empty outside one. */
	group: string;
	text: string;
}

/**
 * The checklist points products can be linked to: those of the ids asked for (to show a product's),
 * or all of the tenant's templates' that are in use (`ids: null`, to choose from), in the templates'
 * order. The checklists module answers; without it, there are none. A module that fails is left
 * out: the shop works without its points.
 */
export const checkpoints = defineCollector<{ ids: readonly number[] | null }, Checkpoint[]>(
	"parts-shop.checkpoints",
	{ onError: "skip" },
);
