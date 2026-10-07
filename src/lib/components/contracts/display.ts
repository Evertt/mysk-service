import AlarmClockCheckIcon from "@lucide/svelte/icons/alarm-clock-check";
import AlarmClockOffIcon from "@lucide/svelte/icons/alarm-clock-off";
import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import CalendarXIcon from "@lucide/svelte/icons/calendar-x";
import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
import ShieldIcon from "@lucide/svelte/icons/shield";
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
import ShieldPlusIcon from "@lucide/svelte/icons/shield-plus";
import TimerIcon from "@lucide/svelte/icons/timer";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { labelOptions, withLabels } from "#lib/i18n/labels.js";
import {
	type ContractLevel,
	contractLevels,
	type ContractStatus,
	contractStatuses,
} from "#lib/models.js";

import type { SlaState } from "./coverage.js";

interface Display {
	icon: Component;
	variant: BadgeVariant;
}

const levelDetails: Record<ContractLevel, Display> = {
	basic: { icon: ShieldIcon, variant: "outline" },
	standard: { icon: ShieldCheckIcon, variant: "outline" },
	premium: { icon: ShieldPlusIcon, variant: "secondary" },
};

const statusDetails: Record<ContractStatus, Display> = {
	upcoming: { icon: CalendarClockIcon, variant: "outline" },
	active: { icon: CalendarCheckIcon, variant: "default" },
	expired: { icon: CalendarXIcon, variant: "ghost" },
};

/** Where a covered order's response stands, see `coverage.ts`. */
const slaStateDetails: Record<SlaState, Display> = {
	on_track: { icon: TimerIcon, variant: "outline" },
	at_risk: { icon: ClockAlertIcon, variant: "secondary" },
	overdue: { icon: AlarmClockOffIcon, variant: "destructive" },
	responded: { icon: AlarmClockCheckIcon, variant: "ghost" },
};

/** Each value's translated `label`, icon and badge variant. */
export const levels = withLabels("contractLevel", levelDetails);
export const statuses = withLabels("contractStatus", statusDetails);
export const slaStates = withLabels("slaState", slaStateDetails);

/** Options for the faceted filters, in order. */
export const levelOptions = labelOptions("contractLevel", contractLevels, levelDetails);
export const statusOptions = labelOptions("contractStatus", contractStatuses, statusDetails);

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** A contract's length, e.g. "2 years", "18 months" or "3 months, 10 days"; both days count. */
export function formatTerm(startsOn: Date, endsOn: Date) {
	const end = new Date(endsOn.getFullYear(), endsOn.getMonth(), endsOn.getDate() + 1);
	// `months` after the start; from the 31st, a month later in a shorter month is the 1st after it.
	const after = (months: number) => {
		const target = new Date(startsOn.getFullYear(), startsOn.getMonth() + months, 1);
		const length = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
		return startsOn.getDate() > length
			? new Date(target.getFullYear(), target.getMonth() + 1, 1)
			: new Date(target.getFullYear(), target.getMonth(), startsOn.getDate());
	};
	let months =
		(end.getFullYear() - startsOn.getFullYear()) * 12 + end.getMonth() - startsOn.getMonth();
	while (months > 0 && after(months) > end) months--;
	const days = Math.round((end.getTime() - after(months).getTime()) / (24 * 60 * 60 * 1000));

	if (days)
		return months ? `${plural(months, "month")}, ${plural(days, "day")}` : plural(days, "day");
	return months % 12 ? plural(months, "month") : plural(months / 12, "year");
}
