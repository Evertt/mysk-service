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

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import { labelOptions, withLabels } from "#lib/i18n/index.ts";
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
	tone: BadgeTone;
}

/**
 * A status also has a colour for the charts, a CSS variable of the theme: the chart tokens in
 * workflow order (so a theme with a single-hue ramp reads as progress), destructive for cancelled,
 * like its badge's tone.
 */
interface StatusDisplay extends Display {
	color: string;
}

const statusDetails: Record<OrderStatus, StatusDisplay> = {
	quote: { icon: FileTextIcon, tone: "info", color: "var(--chart-1)" },
	scheduled: { icon: CalendarClockIcon, tone: "info", color: "var(--chart-2)" },
	in_progress: { icon: TimerIcon, tone: "warning", color: "var(--chart-3)" },
	completed: { icon: CircleCheckIcon, tone: "success", color: "var(--chart-4)" },
	invoiced: { icon: ReceiptIcon, tone: "neutral", color: "var(--chart-5)" },
	cancelled: { icon: CircleXIcon, tone: "danger", color: "var(--destructive)" },
};

const priorityDetails: Record<OrderPriority, Display> = {
	low: { icon: ArrowDownIcon, tone: "neutral" },
	normal: { icon: ArrowRightIcon, tone: "info" },
	high: { icon: ArrowUpIcon, tone: "warning" },
	urgent: { icon: TriangleAlertIcon, tone: "danger" },
};

const typeDetails: Record<OrderType, Omit<Display, "tone">> = {
	installation: { icon: PackagePlusIcon },
	maintenance: { icon: WrenchIcon },
	repair: { icon: HammerIcon },
	inspection: { icon: ClipboardCheckIcon },
};

/** Each value's translated `label`, icon and badge tone (and a status's chart colour). */
export const statuses = withLabels("orderStatus", statusDetails);
export const priorities = withLabels("orderPriority", priorityDetails);
export const types = withLabels("orderType", typeDetails);

/** Options for the faceted filters, in workflow order. */
export const statusOptions = labelOptions("orderStatus", orderStatuses, statusDetails);
export const priorityOptions = labelOptions("orderPriority", orderPriorities, priorityDetails);
export const typeOptions = labelOptions("orderType", orderTypes, typeDetails);

/**
 * The status an open order gets when it's planned: a quote that gets an engineer and a date is
 * scheduled (as in the seed data, where quotes have neither); other statuses stay as they are.
 * The scheduling service (`scheduleOrder()`) and the planning board's moves share it.
 */
export const plannedStatus = (status: OrderStatus, engineerId: number | null): OrderStatus =>
	status === "quote" && engineerId !== null ? "scheduled" : status;

/**
 * What an order's price is made of, in words, from the costs the tenant's modules add to it and
 * labour: "Materials and labour", or "Labour" when no module adds anything.
 */
export const costsLabour = (costs: readonly { label: string }[]) =>
	costs.length
		? m.orders_costs_labour({ costs: costs.map((cost) => cost.label).join(", ") })
		: m.orders_labour();
