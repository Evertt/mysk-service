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

import type { BadgeTone, BadgeVariant } from "#lib/components/ui/badge/index.ts";

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

/** A value that has a meaning (fine, attention, critical), coloured by it. */
interface ToneDisplay {
	icon: Component;
	tone: BadgeTone;
}

const levelDetails: Record<ContractLevel, Display> = {
	basic: { icon: ShieldIcon, variant: "outline" },
	standard: { icon: ShieldCheckIcon, variant: "outline" },
	premium: { icon: ShieldPlusIcon, variant: "secondary" },
};

const statusDetails: Record<ContractStatus, ToneDisplay> = {
	upcoming: { icon: CalendarClockIcon, tone: "info" },
	active: { icon: CalendarCheckIcon, tone: "success" },
	expired: { icon: CalendarXIcon, tone: "neutral" },
};

/** Where a covered order's response stands, see `coverage.ts`. */
const slaStateDetails: Record<SlaState, ToneDisplay> = {
	on_track: { icon: TimerIcon, tone: "info" },
	at_risk: { icon: ClockAlertIcon, tone: "warning" },
	overdue: { icon: AlarmClockOffIcon, tone: "danger" },
	responded: { icon: AlarmClockCheckIcon, tone: "success" },
};

/** Each value's translated `label`, icon and badge variant (a level) or tone. */
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
export function formatTerm(startsOn: Temporal.PlainDate, endsOn: Temporal.PlainDate) {
	const end = endsOn.add({ days: 1 });
	// `months` after the start; from the 31st, a month later in a shorter month is the 1st after it
	// (where Temporal would stop at the month's last day).
	const after = (months: number) => {
		const later = startsOn.add({ months });
		return later.day < startsOn.day ? later.add({ days: 1 }) : later;
	};
	let months = (end.year - startsOn.year) * 12 + end.month - startsOn.month;
	while (months > 0 && Temporal.PlainDate.compare(after(months), end) > 0) months--;
	const days = after(months).until(end).days;

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
