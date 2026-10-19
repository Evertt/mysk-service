/**
 * How the bell and its tray show notifications (`#lib/server/notifications/`): an icon and a label
 * per category, the dot's count, and the tray's days.
 */
import BanIcon from "@lucide/svelte/icons/ban";
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import FilePenIcon from "@lucide/svelte/icons/file-pen";
import HardHatIcon from "@lucide/svelte/icons/hard-hat";
import MessageSquareWarningIcon from "@lucide/svelte/icons/message-square-warning";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import UserMinusIcon from "@lucide/svelte/icons/user-minus";
import UserPlusIcon from "@lucide/svelte/icons/user-plus";
import type { Component } from "svelte";

import type { NotificationCategory } from "./extensions.ts";

/** Each category's icon and label (a message function, read when shown). */
export const notificationCategories: Record<
	NotificationCategory,
	{ icon: Component; label: () => string }
> = {
	reports: { icon: MessageSquareWarningIcon, label: m.common_notifications_category_reports },
	alerts: { icon: TriangleAlertIcon, label: m.common_notifications_category_alerts },
	field: { icon: HardHatIcon, label: m.common_notifications_category_field },
	mine: { icon: FilePenIcon, label: m.common_notifications_category_mine },
	assigned: { icon: UserPlusIcon, label: m.common_notifications_category_assigned },
	planned: { icon: CalendarClockIcon, label: m.common_notifications_category_planned },
	unassigned: { icon: UserMinusIcon, label: m.common_notifications_category_unassigned },
	cancelled: { icon: BanIcon, label: m.common_notifications_category_cancelled },
};

/** The dot's count: up to `cap`, then "9+" (for a cap of 9); none without any. */
export const unreadLabel = (count: number, cap = 9) =>
	count <= 0 ? null : count > cap ? `${cap}+` : String(count);

/**
 * Whether the dot shows: unread notifications came in after what this page marked seen (the
 * server's count lags until something changes again).
 */
export const showsDot = (
	unread: { count: number; newest: number | null } | undefined,
	markedUpTo: number,
) => !!unread && unread.count > 0 && unread.newest !== null && unread.newest > markedUpTo;

/**
 * Entries grouped by the day they were made in `timeZone`, newest day first, each day's in their
 * order (the log's, newest first). Each day once, also when an entry's time is out of step with
 * its place (the demo data's are made up).
 */
export function byDay<Entry extends { at: Temporal.Instant }>(
	entries: readonly Entry[],
	timeZone: string,
): { day: Temporal.PlainDate; entries: Entry[] }[] {
	const days = new Map<string, { day: Temporal.PlainDate; entries: Entry[] }>();
	for (const entry of entries) {
		const day = entry.at.toZonedDateTimeISO(timeZone).toPlainDate();
		const group = days.get(day.toString());
		if (group) group.entries.push(entry);
		else days.set(day.toString(), { day, entries: [entry] });
	}
	return [...days.values()].sort((a, b) => Temporal.PlainDate.compare(b.day, a.day));
}
