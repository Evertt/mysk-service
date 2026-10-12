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

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { dateParts, DAY, daysInMonth, nextDay, zonedDate } from "#lib/dates.ts";

import type { SlaState } from "./coverage.ts";
import { contractLabels } from "./labels.ts";
import {
	type ContractLevel,
	contractLevels,
	type ContractStatus,
	contractStatuses,
} from "./model.ts";

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
export const levels = contractLabels.withLabels("contractLevel", levelDetails);
export const statuses = contractLabels.withLabels("contractStatus", statusDetails);
export const slaStates = contractLabels.withLabels("slaState", slaStateDetails);

/** Options for the faceted filters, in order. */
export const levelOptions = contractLabels.labelOptions(
	"contractLevel",
	contractLevels,
	levelDetails,
);
export const statusOptions = contractLabels.labelOptions(
	"contractStatus",
	contractStatuses,
	statusDetails,
);

/** A contract's length, e.g. "2 years", "18 months" or "3 months, 10 days"; both days count. */
export function formatTerm(startsOn: Date, endsOn: Date) {
	const end = nextDay(endsOn);
	const start = dateParts(startsOn);
	const last = dateParts(end);
	// `months` after the start; from the 31st, a month later in a shorter month is the 1st after it.
	const after = (months: number) =>
		start.day > daysInMonth(start.year, start.month + months)
			? zonedDate(start.year, start.month + months + 1, 1)
			: zonedDate(start.year, start.month + months, start.day);
	let months = (last.year - start.year) * 12 + last.month - start.month;
	while (months > 0 && after(months) > end) months--;
	const days = Math.round((end.getTime() - after(months).getTime()) / DAY);

	if (days) {
		const daysText = m.contracts_term_days({ count: days });
		return months
			? m.contracts_term_months_days({
					months: m.contracts_term_months({ count: months }),
					days: daysText,
				})
			: daysText;
	}
	return months % 12
		? m.contracts_term_months({ count: months })
		: m.contracts_term_years({ count: months / 12 });
}
