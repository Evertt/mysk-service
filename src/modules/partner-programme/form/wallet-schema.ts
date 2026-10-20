/** The forms on a partner's card: which year, and an entry in its wallet made by hand. */
import * as v from "valibot";

import { cents, customerCode, hiddenInt, optionalDate, text, yearBounds } from "#lib/schema.ts";

/** A year, from a hidden field. */
export const yearField = hiddenInt(yearBounds);

/** What happened: credit spent outside the shop, or credit added by hand. */
const manualEntryKinds = ["spend", "adjustment"] as const;

/** An entry in a wallet, by hand: an amount in euros (taken or added), why, and, added, until when. */
const walletEntryFields = {
	kind: v.picklist(manualEntryKinds, m.validation_choose_one),
	amount: v.pipe(cents(), v.minValue(1, m.validation_more_than_zero)),
	note: text(m.partners_wallet_note_required),
	validUntil: optionalDate(),
};

/** The wallet entry's form, with the partner's customer code: added credit needs a last day. */
export const walletEntrySchema = v.pipe(
	v.object({ code: customerCode(), ...walletEntryFields }),
	v.forward(
		v.check(
			({ kind, validUntil }) => kind === "spend" || validUntil !== null,
			m.partners_wallet_valid_until_required,
		),
		["validUntil"],
	),
);
