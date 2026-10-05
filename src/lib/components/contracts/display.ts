import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import CalendarXIcon from "@lucide/svelte/icons/calendar-x";
import ShieldIcon from "@lucide/svelte/icons/shield";
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
import ShieldPlusIcon from "@lucide/svelte/icons/shield-plus";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import {
	type ContractLevel,
	contractLevels,
	type ContractStatus,
	contractStatuses,
} from "#lib/models.js";

interface Display {
	label: string;
	icon: Component;
	variant: BadgeVariant;
}

export const levels: Record<ContractLevel, Display> = {
	basic: { label: "Basic", icon: ShieldIcon, variant: "outline" },
	standard: { label: "Standard", icon: ShieldCheckIcon, variant: "outline" },
	premium: { label: "Premium", icon: ShieldPlusIcon, variant: "secondary" },
};

export const statuses: Record<ContractStatus, Display> = {
	upcoming: { label: "Upcoming", icon: CalendarClockIcon, variant: "outline" },
	active: { label: "Active", icon: CalendarCheckIcon, variant: "default" },
	expired: { label: "Expired", icon: CalendarXIcon, variant: "ghost" },
};

/** Options for the faceted filters, in order. */
export const levelOptions = contractLevels.map((value) => ({ value, ...levels[value] }));
export const statusOptions = contractStatuses.map((value) => ({ value, ...statuses[value] }));

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** A contract's length, e.g. "2 years", "18 months" or "3 months, 10 days"; both days count. */
export function formatTerm(startsOn: Date, endsOn: Date) {
	const end = new Date(endsOn.getFullYear(), endsOn.getMonth(), endsOn.getDate() + 1);
	let months =
		(end.getFullYear() - startsOn.getFullYear()) * 12 + end.getMonth() - startsOn.getMonth();
	if (end.getDate() < startsOn.getDate()) months--;
	const afterMonths = new Date(
		startsOn.getFullYear(),
		startsOn.getMonth() + months,
		startsOn.getDate(),
	);
	const days = Math.round((end.getTime() - afterMonths.getTime()) / (24 * 60 * 60 * 1000));

	if (days)
		return months ? `${plural(months, "month")}, ${plural(days, "day")}` : plural(days, "day");
	return months % 12 ? plural(months, "month") : plural(months / 12, "year");
}
