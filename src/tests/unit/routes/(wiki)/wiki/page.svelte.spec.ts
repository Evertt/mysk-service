/**
 * The wiki's page route in the visitor's language (docs/plans/wiki-dutch.md): a page without its
 * twin shows in English, its article marked `lang="en"` and a note above it, in the visitor's
 * language, saying so. Every real page has its twin (`twins.spec.ts`), so this makes one without,
 * to keep the fallback covered.
 */
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { m } from "#lib/paraglide/messages.js";
import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import WikiPage from "#routes/(wiki)/wiki/[...slug]/+page.svelte";
import Body from "#unit/wiki/plain-page.test-harness.svelte";
import { pageBySlug, pageText, type WikiPage as Page } from "#wiki/pages.ts";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

beforeEach(() => inLanguage("nl"));
afterEach(() => overwriteGetLocale(englishByDefault));

/** The real page `start/what-fieldworks-is`, with a body of one paragraph. */
function real(): Page {
	const own = pageBySlug("start/what-fieldworks-is");
	if (!own) throw new Error("the page to copy is gone");
	return own;
}

/** What the route's `load` returns for `own` read in Dutch (`+page.ts`), with the made-up body. */
function loaded(own: Page) {
	const text = pageText(own, "nl");
	return {
		page: own,
		text,
		untranslated: text.lang !== "nl",
		component: Body,
	};
}

describe("a wiki page in Dutch", () => {
	test("without its twin: in English, with the note in Dutch", async () => {
		const withoutTwin: Page = { ...real(), text: { en: real().text.en } };
		await render(WikiPage, {
			params: { slug: withoutTwin.slug },
			data: loaded(withoutTwin),
		});

		const note = page.getByTestId("wiki-untranslated");
		await expect.element(note).toBeVisible();
		await expect.element(note).toHaveTextContent(m.wiki_not_translated({}, { locale: "nl" }));
		await expect
			.element(page.getByRole("heading", { level: 1 }))
			.toHaveTextContent(withoutTwin.text.en.title);
		expect(document.querySelector("article")?.getAttribute("lang")).toBe("en");
		// The note is in the visitor's language: it sits outside the English article.
		expect(document.querySelector('[data-testid="wiki-untranslated"]')?.closest("article")).toBe(
			null,
		);
		await expect.element(page.getByText("The body of the page")).toBeVisible();
	});

	test("with its twin: in Dutch, without a note", async () => {
		const own = real();
		await render(WikiPage, { params: { slug: own.slug }, data: loaded(own) });

		expect(document.querySelector("article")?.getAttribute("lang")).toBe("nl");
		expect(document.querySelector('[data-testid="wiki-untranslated"]')).toBeNull();
		await expect
			.element(page.getByRole("heading", { level: 1 }))
			.toHaveTextContent(pageText(own, "nl").title);
	});
});
