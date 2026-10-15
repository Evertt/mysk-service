import BanIcon from "@lucide/svelte/icons/ban";
import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import FilePenLineIcon from "@lucide/svelte/icons/file-pen-line";
import SendIcon from "@lucide/svelte/icons/send";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { numberFormatter } from "#lib/i18n/index.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

import { type InvoiceState, invoiceStates } from "./invoice.ts";
import { invoicingLabels } from "./labels.ts";

interface Display {
	icon: Component;
	variant: BadgeVariant;
}

const stateDetails: Record<InvoiceState, Display> = {
	draft: { icon: FilePenLineIcon, variant: "outline" },
	sent: { icon: SendIcon, variant: "secondary" },
	overdue: { icon: ClockAlertIcon, variant: "destructive" },
	paid: { icon: CircleCheckBigIcon, variant: "default" },
	void: { icon: BanIcon, variant: "ghost" },
};

/** An invoice's status as shown (overdue for sent ones past their due date), translated. */
export const states = invoicingLabels.withLabels("invoiceState", stateDetails);

/** Options for the faceted filter, in order. */
export const stateOptions = invoicingLabels.labelOptions(
	"invoiceState",
	invoiceStates,
	stateDetails,
);

const percent = numberFormatter({ style: "percent", maximumFractionDigits: 2 });

/** A VAT rate (in percent) as shown, e.g. `21%` or `5.5%`; in Dutch `5,5%`. */
export const formatRate = (rate: number, locale?: Locale) => percent(rate / 100, locale);
