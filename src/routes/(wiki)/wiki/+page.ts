import { redirect } from "@sveltejs/kit";

import { wikiPages } from "#wiki/pages.ts";

import type { PageLoad } from "./$types";

/** `/wiki` opens the first page. */
export const load: PageLoad = () => {
	redirect(307, `/wiki/${wikiPages[0].slug}`);
};
