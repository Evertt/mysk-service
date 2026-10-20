/**
 * Closing a year for all its partners: a preview of what it freezes, and the close itself, which
 * only managers may do. A partner's own close and its choice are in `partners.remote.ts`.
 */
import * as v from "valibot";

import { year } from "#lib/schema.ts";

import { yearField } from "./form/wallet-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { closePreview, closeYear } from "./server/close.ts";

/** What closing the year would freeze: each partner's figures now, or as closed. */
export const getClosePreview = query(year(), (wanted) => closePreview(wanted));

/** Closes the year for every partner it isn't closed for yet. Answers how many. */
export const closeProgrammeYear = forManagers.form(v.object({ year: yearField }), async (input) => {
	const closed = await closeYear(input.year);
	void getClosePreview(input.year).refresh();
	return { closed };
});
