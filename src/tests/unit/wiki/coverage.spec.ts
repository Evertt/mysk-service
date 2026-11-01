/**
 * The wiki says something about every module, core domain, shell and theme: a page lists it in its
 * `covers`. A new module, domain, shell or theme without a page fails here, naming the key to
 * cover.
 */
import { describe, expect, test } from "vite-plus/test";

import { shells } from "#lib/auth/shells.ts";
import { moduleIds } from "#lib/modules/ids.ts";
import { themeNames } from "#lib/themes/index.ts";
import { coreDomains, wikiPages, type Coverage } from "#wiki/pages.ts";

/** Every module, core domain, shell and theme the wiki must cover. */
const expectedKeys = (): Coverage[] => [
	...moduleIds.map((id) => `module:${id}` as const),
	...coreDomains.map((name) => `domain:${name}` as const),
	...Object.keys(shells).map((name) => `shell:${name}` as Coverage),
	...themeNames.map((name) => `theme:${name}` as const),
];

/** The expected keys that no page covers. */
function uncovered(expected: readonly Coverage[], covers: readonly Coverage[]) {
	return expected.filter((key) => !covers.includes(key));
}

describe("the wiki's coverage", () => {
	test("every module, domain, shell and theme has a page", () => {
		expect(
			uncovered(
				expectedKeys(),
				wikiPages.flatMap((page) => page.covers),
			),
			"no page covers these: write one, or add the key to a page's `covers:`",
		).toEqual([]);
	});

	test("the check finds what it should (made-up input)", () => {
		const expected: Coverage[] = ["module:invoices", "domain:orders", "shell:office"];
		expect(uncovered(expected, ["domain:orders"])).toEqual(["module:invoices", "shell:office"]);
		expect(uncovered(expected, expected)).toEqual([]);
	});
});
