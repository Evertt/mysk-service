import BanIcon from "@lucide/svelte/icons/ban";
import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import FilePenLineIcon from "@lucide/svelte/icons/file-pen-line";
import SendIcon from "@lucide/svelte/icons/send";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";

import { type InvoiceState, invoiceStates } from "./invoice.js";

interface Display {
	label: string;
	icon: Component;
	variant: BadgeVariant;
}

/** An invoice's status as shown, with overdue for sent ones past their due date. */
export const states: Record<InvoiceState, Display> = {
	draft: { label: "Draft", icon: FilePenLineIcon, variant: "outline" },
	sent: { label: "Sent", icon: SendIcon, variant: "secondary" },
	overdue: { label: "Overdue", icon: ClockAlertIcon, variant: "destructive" },
	paid: { label: "Paid", icon: CircleCheckBigIcon, variant: "default" },
	void: { label: "Void", icon: BanIcon, variant: "ghost" },
};

/** Options for the faceted filter, in order. */
export const stateOptions = invoiceStates.map((value) => ({ value, ...states[value] }));
