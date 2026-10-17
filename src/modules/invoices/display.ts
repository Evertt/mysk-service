import BanIcon from "@lucide/svelte/icons/ban";
import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import FilePenLineIcon from "@lucide/svelte/icons/file-pen-line";
import SendIcon from "@lucide/svelte/icons/send";
import type { Component } from "svelte";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import { numberFormatter } from "#lib/i18n/index.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

import { type CreditNoteState, creditNoteStates } from "./credit-note.ts";
import { type InvoiceState, invoiceStates } from "./invoice.ts";
import { invoicingLabels } from "./labels.ts";

interface Display {
	icon: Component;
	tone: BadgeTone;
}

const stateDetails: Record<InvoiceState, Display> = {
	draft: { icon: FilePenLineIcon, tone: "neutral" },
	sent: { icon: SendIcon, tone: "info" },
	overdue: { icon: ClockAlertIcon, tone: "danger" },
	paid: { icon: CircleCheckBigIcon, tone: "success" },
	void: { icon: BanIcon, tone: "neutral" },
};

/** An invoice's status as shown (overdue for sent ones past their due date), translated. */
export const states = invoicingLabels.withLabels("invoiceState", stateDetails);

/** Options for the faceted filter, in order. */
export const stateOptions = invoicingLabels.labelOptions(
	"invoiceState",
	invoiceStates,
	stateDetails,
);

const creditStateDetails: Record<CreditNoteState, Display> = {
	draft: stateDetails.draft,
	sent: stateDetails.sent,
	paid: stateDetails.paid,
	void: stateDetails.void,
};

/** A credit note's status as shown (paid as settled), translated. */
export const creditStates = invoicingLabels.withLabels("creditNoteState", creditStateDetails);

/** Options for the credit notes' faceted filter, in order. */
export const creditStateOptions = invoicingLabels.labelOptions(
	"creditNoteState",
	creditNoteStates,
	creditStateDetails,
);

const percent = numberFormatter({ style: "percent", maximumFractionDigits: 2 });

/** A VAT rate (in percent) as shown, e.g. `21%` or `5.5%`; in Dutch `5,5%`. */
export const formatRate = (rate: number, locale?: Locale) => percent(rate / 100, locale);
