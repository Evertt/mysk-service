import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
import FileTextIcon from "@lucide/svelte/icons/file-text";
import HammerIcon from "@lucide/svelte/icons/hammer";
import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
import ReceiptIcon from "@lucide/svelte/icons/receipt";
import TimerIcon from "@lucide/svelte/icons/timer";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import WrenchIcon from "@lucide/svelte/icons/wrench";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import {
	type OrderPriority,
	orderPriorities,
	type OrderStatus,
	orderStatuses,
	type OrderType,
	orderTypes,
} from "#lib/models.js";

interface Display {
	label: string;
	icon: Component;
	variant: BadgeVariant;
}

export const statuses: Record<OrderStatus, Display> = {
	quote: { label: "Quote", icon: FileTextIcon, variant: "outline" },
	scheduled: { label: "Scheduled", icon: CalendarClockIcon, variant: "secondary" },
	in_progress: { label: "In progress", icon: TimerIcon, variant: "default" },
	completed: { label: "Completed", icon: CircleCheckIcon, variant: "secondary" },
	invoiced: { label: "Invoiced", icon: ReceiptIcon, variant: "outline" },
	cancelled: { label: "Cancelled", icon: CircleXIcon, variant: "destructive" },
};

export const priorities: Record<OrderPriority, Display> = {
	low: { label: "Low", icon: ArrowDownIcon, variant: "ghost" },
	normal: { label: "Normal", icon: ArrowRightIcon, variant: "outline" },
	high: { label: "High", icon: ArrowUpIcon, variant: "secondary" },
	urgent: { label: "Urgent", icon: TriangleAlertIcon, variant: "destructive" },
};

export const types: Record<OrderType, Omit<Display, "variant">> = {
	installation: { label: "Installation", icon: PackagePlusIcon },
	maintenance: { label: "Maintenance", icon: WrenchIcon },
	repair: { label: "Repair", icon: HammerIcon },
	inspection: { label: "Inspection", icon: ClipboardCheckIcon },
};

/** Options for the faceted filters, in workflow order. */
export const statusOptions = orderStatuses.map((value) => ({ value, ...statuses[value] }));
export const priorityOptions = orderPriorities.map((value) => ({ value, ...priorities[value] }));
export const typeOptions = orderTypes.map((value) => ({ value, ...types[value] }));
