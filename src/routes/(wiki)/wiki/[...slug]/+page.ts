import { error } from "@sveltejs/kit";

import { getLocale } from "#lib/paraglide/runtime.js";
import { pageBySlug, pageText } from "#wiki/pages.ts";

import type { PageLoad } from "./$types";

/**
 * The page at `/wiki/<slug>` in the visitor's language, with its component, or a 404: its twin in
 * that language, or else the English page (`pageText()`), and whether that's for want of a twin.
 */
export const load = (async ({ params }) => {
	const page = pageBySlug(params.slug);
	if (!page) error(404);
	const text = pageText(page);
	return {
		page,
		text,
		untranslated: text.lang !== getLocale(),
		component: (await text.load()).default,
	};
}) satisfies PageLoad;
