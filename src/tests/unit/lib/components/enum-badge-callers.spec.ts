/**
 * An enum value is shown as a badge by `EnumBadge` and its kind's display map, not by a `<Badge>`
 * whose variant is looked up (`variant={display.tone}`, `variant={tones[status]}`) with its icon
 * and label written out beside it. Checked on the source: no `<Badge>` outside `EnumBadge` takes
 * its variant from a lookup, but those that show something other than an enum value.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../..");

/** The `<Badge>`s that look their variant up but show no enum value, and why. */
const allowed = new Set([
	// The badge itself, as `EnumBadge` writes it.
	"src/lib/components/enum-badge.svelte",
	// A select of values that looks like their badges; its options come from a display map.
	"src/lib/components/badge-select.svelte",
	// The modules' tags on an order: a label and detail of their own, not an enum's.
	"src/lib/orders/ui/order-tags.svelte",
	// A checklist's outcome: a count of rejected points, not a value.
	"src/modules/checklists/ui/outcome-badge.svelte",
	// The door-open bands of the legend, each with its own text.
	"src/modules/docks/board/signals-card.svelte",
	// A day's load on the planning board, coloured by how full it is, showing its count of orders.
	"src/modules/schedule/board/week-grid.svelte",
]);

/** The lines of `source` with a `<Badge>` whose variant is a lookup, e.g. `variant={display.tone}`. */
export function lookedUpBadges(source: string) {
	return [...source.matchAll(/<Badge\b[^>]*?\bvariant=\{\s*([^}]*?)\s*\}/g)]
		.filter(([, variant]) => /^[\w$]+(?:\.[\w$]+|\[[^\]]+\])+$/.test(variant))
		.map((match) => source.slice(0, match.index).split("\n").length);
}

test("no component looks up a badge's variant by hand: EnumBadge shows enum values", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".svelte") && !file.startsWith("lib/components/ui/"))
		.map((file) => `src/${file}`)
		.filter((file) => !allowed.has(file))
		.flatMap((file) =>
			lookedUpBadges(readFileSync(join(root, file), "utf8")).map((line) => `${file}:${line}`),
		);
	expect(found).toEqual([]);
});

test("finds a variant looked up from a display map or a tone map, on any line", () => {
	expect(
		lookedUpBadges("<Badge variant={display.tone}>\n\t<display.icon />{display.label}</Badge>"),
	).toEqual([1]);
	expect(
		lookedUpBadges('<p></p>\n<Badge\n\tclass="x"\n\tvariant={tones[state]}\n>{label}</Badge>'),
	).toEqual([2]);
	expect(
		lookedUpBadges("<Badge variant={stateBadges[zone.state]} data-state={zone.state}>"),
	).toEqual([1]);
});

test("lets literal, conditional and plain variants through", () => {
	expect(lookedUpBadges('<Badge variant="info">{level}</Badge>')).toEqual([]);
	expect(lookedUpBadges('<Badge variant={covered ? "secondary" : "outline"}>')).toEqual([]);
	expect(lookedUpBadges("<Badge variant={variant}>")).toEqual([]);
	expect(lookedUpBadges("<EnumBadge display={orderStatusDisplay} value={order.status} />")).toEqual(
		[],
	);
});
