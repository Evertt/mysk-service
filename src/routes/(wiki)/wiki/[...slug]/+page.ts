import { error } from "@sveltejs/kit";

import { pageBySlug } from "#wiki/pages.ts";

import type { PageLoad } from "./$types";

/** The page at `/wiki/<slug>`, with its component, or a 404. */
export const load = (async ({ params }) => {
	const page = pageBySlug(params.slug);
	if (!page) error(404);
	return { page, component: (await page.load()).default };
}) satisfies PageLoad;
