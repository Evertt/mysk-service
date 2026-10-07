import BanIcon from "@lucide/svelte/icons/ban";
import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import FilePenLineIcon from "@lucide/svelte/icons/file-pen-line";
import SendIcon from "@lucide/svelte/icons/send";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { labelOptions, withLabels } from "#lib/i18n/labels.js";

import { type InvoiceState, invoiceStates } from "./invoice.js";

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
export const states = withLabels("invoiceState", stateDetails);

/** Options for the faceted filter, in order. */
export const stateOptions = labelOptions("invoiceState", invoiceStates, stateDetails);
