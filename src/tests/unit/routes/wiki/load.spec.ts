/**
 * What `/wiki/[...slug]` loads: a page of the registry in the visitor's language with its
 * component (its Dutch twin's, or English for want of one), or a 404.
 */
import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { load as loadIndex } from "#routes/(wiki)/wiki/+page.ts";
import { load } from "#routes/(wiki)/wiki/[...slug]/+page.ts";
import { pageBySlug, wikiPages } from "#wiki/pages.ts";

const loadSlug = (slug: string) => load({ params: { slug } } as Parameters<typeof load>[0]);

/** A page without its Dutch twin yet, if there's one left. */
const untranslated = wikiPages.find((page) => !page.text.nl);

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

describe("/wiki/[...slug]", () => {
	test("loads a known slug", async () => {
		const loaded = await loadSlug("start/what-fieldworks-is");
		expect(loaded.text).toMatchObject({ title: "What Fieldworks is", lang: "en" });
		expect(loaded.untranslated).toBe(false);
		expect(loaded.component).toBe(
			(await pageBySlug("start/what-fieldworks-is")!.text.en.load()).default,
		);
	});

	test("loads the Dutch twin for a Dutch visitor", async () => {
		overwriteGetLocale(() => "nl");
		const loaded = await loadSlug("start/what-fieldworks-is");
		expect(loaded.text).toMatchObject({ title: "Wat Fieldworks is", lang: "nl" });
		expect(loaded.untranslated).toBe(false);
		expect(loaded.component).toBe(
			(await pageBySlug("start/what-fieldworks-is")!.text.nl!.load()).default,
		);
	});

	test.runIf(untranslated)(
		"loads the English page for a Dutch visitor where it has no twin, and says so",
		async () => {
			overwriteGetLocale(() => "nl");
			const loaded = await loadSlug(untranslated!.slug);
			expect(loaded.text).toMatchObject({ title: untranslated!.text.en.title, lang: "en" });
			expect(loaded.untranslated).toBe(true);
		},
	);

	test("404s an unknown slug", async () => {
		await expect(loadSlug("nope")).rejects.toMatchObject({ status: 404 });
	});
});

describe("/wiki", () => {
	test("redirects to the first page", () => {
		expect(() => loadIndex({} as Parameters<typeof loadIndex>[0])).toThrow(
			expect.objectContaining({ status: 307, location: "/wiki/start/what-fieldworks-is" }),
		);
	});
});
