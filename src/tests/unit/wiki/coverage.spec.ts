/**
 * The wiki says something about every module, core domain, shell and theme: a page lists it in its
 * `covers`. A new module, domain, shell or theme without a page fails here, naming the key to
 * cover. `notYetWritten` is the allow-list of what has no page yet; a page that lands covers its
 * keys and deletes them from the list (the second test refuses a key that has a page already), so
 * the list only shrinks and reaches `[]`.
 */
import { describe, expect, test } from "vite-plus/test";

import { shells } from "#lib/auth/shells.ts";
import { moduleIds } from "#lib/modules/ids.ts";
import { themeNames } from "#lib/themes/index.ts";
import { coreDomains, wikiPages, type Coverage } from "#wiki/pages.ts";

/** Written out, not computed, so it can't drift from the code: it's the pages still to write. */
const notYetWritten: readonly Coverage[] = [
	"module:checklists",
	"module:condition",
	"module:contracts",
	"module:docks",
	"module:energy",
	"module:invoices",
	"module:maintenance",
	"module:materials",
	"module:partner-programme",
	"module:parts-shop",
	"module:schedule",
	"theme:neutral",
	"theme:harbor",
	"theme:lagoon",
	"theme:blueprint",
	"theme:brutalist",
	"theme:sorbet",
];

/** Every module, core domain, shell and theme the wiki must cover. */
const expectedKeys = (): Coverage[] => [
	...moduleIds.map((id) => `module:${id}` as const),
	...coreDomains.map((name) => `domain:${name}` as const),
	...Object.keys(shells).map((name) => `shell:${name}` as Coverage),
	...themeNames.map((name) => `theme:${name}` as const),
];

/** The expected keys that no page covers and the allow-list doesn't excuse. */
function uncovered(
	expected: readonly Coverage[],
	covers: readonly Coverage[],
	allowed: readonly Coverage[],
) {
	return expected.filter((key) => !covers.includes(key) && !allowed.includes(key));
}

/** The allow-listed keys a page covers after all. */
function staleAllowed(allowed: readonly Coverage[], covers: readonly Coverage[]) {
	return allowed.filter((key) => covers.includes(key));
}

const covered = () => wikiPages.flatMap((page) => page.covers);

describe("the wiki's coverage", () => {
	test("every module, domain, shell and theme has a page", () => {
		expect(
			uncovered(expectedKeys(), covered(), notYetWritten),
			"no page covers these (add `covers:` to a page, or to notYetWritten while it's unwritten)",
		).toEqual([]);
	});

	test("the allow-list holds only what's still missing", () => {
		expect(
			staleAllowed(notYetWritten, covered()),
			"a page covers these now: delete them from notYetWritten",
		).toEqual([]);
		expect(
			notYetWritten.filter((key) => !expectedKeys().includes(key)),
			"notYetWritten names something that no longer exists",
		).toEqual([]);
	});

	test("the checks find what they should (made-up input)", () => {
		const expected: Coverage[] = ["module:invoices", "domain:orders", "shell:office"];
		expect(uncovered(expected, ["domain:orders"], [])).toEqual(["module:invoices", "shell:office"]);
		expect(uncovered(expected, ["domain:orders"], ["module:invoices"])).toEqual(["shell:office"]);
		expect(uncovered(expected, expected, [])).toEqual([]);
		expect(staleAllowed(["module:invoices", "shell:office"], ["shell:office"])).toEqual([
			"shell:office",
		]);
		expect(staleAllowed(["module:invoices"], ["shell:office"])).toEqual([]);
	});
});
