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

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { labelOptions, withLabels } from "#lib/i18n/labels.ts";
import {
	type OrderPriority,
	orderPriorities,
	type OrderStatus,
	orderStatuses,
	type OrderType,
	orderTypes,
} from "#lib/models.ts";

interface Display {
	icon: Component;
	variant: BadgeVariant;
}

/**
 * A status also has a colour for the charts, a CSS variable of the theme: the chart tokens in
 * workflow order (so a theme with a single-hue ramp reads as progress), destructive for cancelled,
 * like its badge.
 */
interface StatusDisplay extends Display {
	color: string;
}

const statusDetails: Record<OrderStatus, StatusDisplay> = {
	quote: { icon: FileTextIcon, variant: "outline", color: "var(--chart-1)" },
	scheduled: { icon: CalendarClockIcon, variant: "secondary", color: "var(--chart-2)" },
	in_progress: { icon: TimerIcon, variant: "default", color: "var(--chart-3)" },
	completed: { icon: CircleCheckIcon, variant: "secondary", color: "var(--chart-4)" },
	invoiced: { icon: ReceiptIcon, variant: "outline", color: "var(--chart-5)" },
	cancelled: { icon: CircleXIcon, variant: "destructive", color: "var(--destructive)" },
};

const priorityDetails: Record<OrderPriority, Display> = {
	low: { icon: ArrowDownIcon, variant: "ghost" },
	normal: { icon: ArrowRightIcon, variant: "outline" },
	high: { icon: ArrowUpIcon, variant: "secondary" },
	urgent: { icon: TriangleAlertIcon, variant: "destructive" },
};

const typeDetails: Record<OrderType, Omit<Display, "variant">> = {
	installation: { icon: PackagePlusIcon },
	maintenance: { icon: WrenchIcon },
	repair: { icon: HammerIcon },
	inspection: { icon: ClipboardCheckIcon },
};

/** Each value's translated `label`, icon and badge variant (and a status's chart colour). */
export const statuses = withLabels("orderStatus", statusDetails);
export const priorities = withLabels("orderPriority", priorityDetails);
export const types = withLabels("orderType", typeDetails);

/** Options for the faceted filters, in workflow order. */
export const statusOptions = labelOptions("orderStatus", orderStatuses, statusDetails);
export const priorityOptions = labelOptions("orderPriority", orderPriorities, priorityDetails);
export const typeOptions = labelOptions("orderType", orderTypes, typeDetails);
