/**
 * Closing a year for all its partners: a preview of what it freezes, and the close itself, which
 * only managers may do. A partner's own close and its choice are in `partners.remote.ts`.
 */
import * as v from "valibot";

import { yearField } from "./form/wallet-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { closePreview, closeYear } from "./server/close.ts";

/** What closing the year would freeze: each partner's figures now, or as closed. */
export const getClosePreview = query(
	v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
	(year) => closePreview(year),
);

/** Closes the year for every partner it isn't closed for yet. Answers how many. */
export const closeProgrammeYear = forManagers.form(v.object({ year: yearField }), async (input) => {
	const closed = await closeYear(input.year);
	void getClosePreview(input.year).refresh();
	return { closed };
});
