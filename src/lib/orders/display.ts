import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleEllipsisIcon from "@lucide/svelte/icons/circle-ellipsis";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
import FileTextIcon from "@lucide/svelte/icons/file-text";
import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
import HammerIcon from "@lucide/svelte/icons/hammer";
import InboxIcon from "@lucide/svelte/icons/inbox";
import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
import ReceiptIcon from "@lucide/svelte/icons/receipt";
import RulerIcon from "@lucide/svelte/icons/ruler";
import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
import SirenIcon from "@lucide/svelte/icons/siren";
import TimerIcon from "@lucide/svelte/icons/timer";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import WrenchIcon from "@lucide/svelte/icons/wrench";
import type { Component } from "svelte";

import { unitTitle } from "#lib/equipment/index.ts";
import { type BadgeDisplay, formatNumber, labelOptions, withLabels } from "#lib/i18n/index.ts";
import {
	type OrderPriority,
	orderPriorities,
	type OrderStatus,
	orderStatuses,
	type OrderType,
	orderTypes,
} from "#lib/models.ts";

/**
 * A status also has a colour for the charts, a CSS variable of the theme: the chart tokens in
 * workflow order (so a theme with a single-hue ramp reads as progress), destructive for cancelled,
 * like its badge's tone, and the muted foreground for orders not accepted yet (before the ramp).
 */
interface StatusDisplay extends BadgeDisplay {
	color: string;
}

const statusDetails: Record<OrderStatus, StatusDisplay> = {
	awaiting_acceptance: { icon: InboxIcon, tone: "warning", color: "var(--muted-foreground)" },
	quote: { icon: FileTextIcon, tone: "info", color: "var(--chart-1)" },
	scheduled: { icon: CalendarClockIcon, tone: "info", color: "var(--chart-2)" },
	in_progress: { icon: TimerIcon, tone: "warning", color: "var(--chart-3)" },
	completed: { icon: CircleCheckIcon, tone: "success", color: "var(--chart-4)" },
	invoiced: { icon: ReceiptIcon, tone: "neutral", color: "var(--chart-5)" },
	cancelled: { icon: CircleXIcon, tone: "danger", color: "var(--destructive)" },
};

const priorityDetails: Record<OrderPriority, BadgeDisplay> = {
	low: { icon: ArrowDownIcon, tone: "neutral" },
	normal: { icon: ArrowRightIcon, tone: "info" },
	high: { icon: ArrowUpIcon, tone: "warning" },
	urgent: { icon: TriangleAlertIcon, tone: "danger" },
};

const typeDetails: Record<OrderType, { icon: Component }> = {
	breakdown: { icon: SirenIcon },
	repair: { icon: HammerIcon },
	maintenance: { icon: WrenchIcon },
	inspection: { icon: ClipboardCheckIcon },
	installation: { icon: PackagePlusIcon },
	survey: { icon: RulerIcon },
	damage: { icon: ShieldAlertIcon },
	project: { icon: FolderKanbanIcon },
	other: { icon: CircleEllipsisIcon },
};

/** Each value's translated `label`, icon and badge tone (and a status's chart colour). */
export const orderStatusDisplay = withLabels("orderStatus", statusDetails);
export const orderPriorityDisplay = withLabels("orderPriority", priorityDetails);
export const orderTypeDisplay = withLabels("orderType", typeDetails);

/** Options for the faceted filters, in workflow order. */
export const statusOptions = labelOptions("orderStatus", orderStatuses, statusDetails);
export const priorityOptions = labelOptions("orderPriority", orderPriorities, priorityDetails);
export const typeOptions = labelOptions("orderType", orderTypes, typeDetails);

/**
 * What an order's price is made of, in words, from the costs the tenant's modules add to it and
 * labour: "Materials and labour", or "Labour" when no module adds anything.
 */
export const costsLabour = (costs: readonly { label: string }[]) =>
	costs.length
		? m.orders_costs_labour({ costs: costs.map((cost) => cost.label).join(", ") })
		: m.orders_labour();

/**
 * An order's units in short, e.g. "Deur 07 +14": what its first unit is called, and how many more it
 * has; `null` for an order without units.
 */
export const unitsSummary = (
	first: { name: string | null; manufacturer: string; model: string } | null,
	count: number,
) =>
	first &&
	(count > 1
		? m.orders_units_summary({ unit: unitTitle(first), more: formatNumber(count - 1) })
		: unitTitle(first));
