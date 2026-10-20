import BanIcon from "@lucide/svelte/icons/ban";
import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import FilePenLineIcon from "@lucide/svelte/icons/file-pen-line";
import SendIcon from "@lucide/svelte/icons/send";

import type { BadgeDisplay } from "#lib/i18n/index.ts";

import type { CreditNoteState } from "./credit-note.ts";
import type { InvoiceState } from "./invoice.ts";
import { invoicingLabels } from "./labels.ts";

const stateDetails: Record<InvoiceState, BadgeDisplay> = {
	draft: { icon: FilePenLineIcon, tone: "neutral" },
	sent: { icon: SendIcon, tone: "info" },
	overdue: { icon: ClockAlertIcon, tone: "danger" },
	paid: { icon: CircleCheckBigIcon, tone: "success" },
	void: { icon: BanIcon, tone: "neutral" },
};

/** An invoice's status as shown (overdue for sent ones past their due date), translated. */
export const invoiceStateDisplay = invoicingLabels.withLabels("invoiceState", stateDetails);

const creditStateDetails: Record<CreditNoteState, BadgeDisplay> = {
	draft: stateDetails.draft,
	sent: stateDetails.sent,
	paid: stateDetails.paid,
	void: stateDetails.void,
};

/** A credit note's status as shown (paid as settled), translated. */
export const creditNoteStateDisplay = invoicingLabels.withLabels(
	"creditNoteState",
	creditStateDetails,
);
