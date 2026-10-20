/**
 * One way to choose one of a few options: `FilterChips` (chips, links with `href` for a choice kept
 * in the URL) or `SegmentedNav` (a page's views), from `src/lib/components/`. The hand-made rows
 * they replaced each marked the chosen button their own way and drifted apart in look. A row of
 * toggle buttons (`aria-pressed`) or tabs (`role="tablist"`, `role="tab"`) outside the kit is one of
 * those, unless it's below with why.
 *
 * A hand-made row of links (`aria-current`) can't be told apart this way from a list's selected
 * row or a calendar's today, so it isn't refused here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Toggle buttons that are no choice row, with why. */
const allowed: Record<string, string> = {
	"src/modules/checklists/portal/field-checklist.svelte":
		"a point's result in the checklist's form, each with its icon and colour",
	"src/modules/checklists/assets/office-checklist.svelte":
		"a point's result in the checklist's form, each with its icon and colour",
	"src/modules/condition/list/units-table.svelte":
		"a stat tile's button that filters the table by the tile's status",
};

/** The lines of `source` that make a toggle button or a tab. */
function choiceMarks(source: string) {
	return source
		.split("\n")
		.flatMap((line, index) =>
			/\baria-pressed=|\brole="tab(?:list)?"/.test(line) ? [index + 1] : [],
		);
}

test("choices among a few options are FilterChips or SegmentedNav", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				file.endsWith(".svelte") &&
				!file.startsWith("src/lib/components/") &&
				// Component tests render the kit's parts themselves.
				!file.startsWith("src/tests/") &&
				!(file in allowed),
		)
		.flatMap((file) =>
			choiceMarks(readFileSync(join(root, file), "utf8")).map((line) => `${file}:${line}`),
		);
	expect(found).toEqual([]);
});

test("the allowed toggle buttons still are", () => {
	for (const file of Object.keys(allowed)) {
		expect(choiceMarks(readFileSync(join(root, file), "utf8")), file).not.toEqual([]);
	}
});

test("finds toggle buttons and tabs, not other roles", () => {
	expect(choiceMarks("<div>\n\t<button aria-pressed={on}>")).toEqual([2]);
	expect(choiceMarks('<div role="tablist">\n<a role="tab">')).toEqual([1, 2]);
	expect(choiceMarks('<div role="table">\n<FilterChips {options} />')).toEqual([]);
});
